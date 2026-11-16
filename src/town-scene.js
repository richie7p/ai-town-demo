import { ACTION_NAMES } from './config.js';
import * as townAssets from './town-assets.js';
import { RESIDENT_CLIPS } from './resident-motion.js';
import { RESIDENT_SCALE, SEATED_OFFSET, motionRate, walkDuration, seatedPose } from './character-motion.js';
import { WORLD_SIZE, ZONE_CENTERS, clampZoom, isContinuousFrame, characterPosition, presentationPath, samplePath, directionBetween, characterPresentation, visibleUtterances } from './town-view-model.js';
import { TILE_SIZE, MAP_OBJECTS, isWalkable, findWalkPath, activityAnchor, nearestWalkable, locationAt, createMinimapDataUrl } from './town-map.js';

const { width: W, height: H } = WORLD_SIZE;
const VIEW_WIDTH=1200;
const HERO_FOCUS=[496,384];
const FONT='"Microsoft JhengHei", "Noto Sans TC", sans-serif';
const idleFrames={down:0,left:1,right:2,up:3};
const characterClips=RESIDENT_CLIPS;
const appearanceIdentity=(agent,index)=>JSON.stringify([agent.id,agent.name,agent.color,index]);
const clip=(n,a,b)=>Math.max(a,Math.min(b,n));
const pathLength=path=>path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-path[i][0],p[1]-path[i][1]),0);
const wrap=(text,columns=16)=>Array.from(String(text)).reduce((lines,c,i)=>{if(i%columns===0)lines.push('');lines[lines.length-1]+=c;return lines;},[]).join('\n');
const WALK_KEYS=new Set(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright']);

// Residents consume completed V5 frames. The visitor is a separate presentation
// actor; neither its movement nor object inspection changes a research record.
export function createTownScene(host,{onSelect=()=>{},onCameraChange=()=>{},onExploreChange=()=>{},onInspectObject=()=>{},onReady=()=>{},onError=()=>{}}={}){
  const Phaser=globalThis.Phaser;
  let game,scene,pending=null,destroyed=false,resizeObserver;
  const measureViewHeight=()=>host?.clientWidth>0&&host?.clientHeight>0?Math.round(clip(VIEW_WIDTH*host.clientHeight/host.clientWidth,400,2400)):800;
  let viewHeight=measureViewHeight(),fitZoom=Math.min(VIEW_WIDTH/W,viewHeight/H);
  let zoom=1.65,following=false,exploring=false,explorerFollowing=false,dpr=clip(globalThis.devicePixelRatio||1,1,2);
  let lastCameraSignature='',lastExploreSignature='';
  const notifyCamera=(force=false)=>{
    const view=scene?.cameras.main.worldView;
    const worldView=view?.width>0?{x:Math.max(0,view.x),y:Math.max(0,view.y),width:Math.min(W,view.width),height:Math.min(H,view.height)}:{x:0,y:0,width:W,height:H};
    const signature=[zoom,following,...Object.values(worldView).map(n=>Math.round(n*10))].join('|');
    if(force||signature!==lastCameraSignature){lastCameraSignature=signature;onCameraChange({zoom,following,worldView});}
  };
  const notifyExplore=(message='',force=false)=>{
    const visitor=scene?.visitor;
    const location=visitor?locationAt(visitor.container.x,visitor.container.y):{zone:null,name:'花園步道'};
    const moving=!!visitor?.moving;
    if(game?.canvas){
      game.canvas.dataset.exploring=String(exploring);
      game.canvas.dataset.visitorX=visitor?visitor.container.x.toFixed(1):'';
      game.canvas.dataset.visitorY=visitor?visitor.container.y.toFixed(1):'';
      game.canvas.dataset.visitorLocation=location?.name||'花園步道';
      game.canvas.dataset.visitorMoving=String(moving);
    }
    const signature=[exploring,moving,location?.name,location?.room,message].join('|');
    if(force||signature!==lastExploreSignature){lastExploreSignature=signature;onExploreChange({active:exploring,moving,location,locationName:location?.name||'花園步道',message});}
  };
  const reportError=error=>{if(!destroyed)onError(error instanceof Error?error:new Error(String(error)));};
  const api={
    render(frame,options={}){
      if(destroyed)return;
      pending={frame,options:{selected:null,playing:false,duration:800,reducedMotion:false,animate:true,...options}};
      if(scene?.ready)try{scene.applyFrame(pending);}catch(error){reportError(error);}
    },
    zoomIn(){zoom=clampZoom(zoom+.25);scene?.applyCamera();notifyCamera();},
    isTransitioning(){return !!scene&&[...scene.characters.values()].some(actor=>actor.moving||actor.transitioning);},
    zoomOut(){zoom=clampZoom(zoom-.25);scene?.applyCamera();notifyCamera();},
    resetCamera(){zoom=1;following=false;explorerFollowing=false;scene?.applyCamera(true);notifyCamera();},
    setFollow(value){following=!!value;explorerFollowing=false;if(following)zoom=Math.max(3,zoom);scene?.applyCamera();notifyCamera();},
    setExplore(value){exploring=!!value;following=false;explorerFollowing=exploring;if(exploring)zoom=Math.max(2.2,zoom);scene?.toggleExplore();scene?.applyCamera();notifyExplore('',true);notifyCamera();},
    focusZone(zone){
      const point=ZONE_CENTERS[zone];if(!point)return;
      following=false;explorerFollowing=false;zoom=Math.max(2.2,zoom);scene?.applyCamera();scene?.cameras.main.stopFollow().centerOn(point[0],point[1]);notifyCamera(true);
    },
    panTo(x,y){if(!Number.isFinite(x)||!Number.isFinite(y))return;following=false;explorerFollowing=false;scene?.applyCamera();scene?.cameras.main.stopFollow().centerOn(clip(x,0,W),clip(y,0,H));notifyCamera(true);},
    destroy(){if(destroyed)return;destroyed=true;resizeObserver?.disconnect();globalThis.removeEventListener('resize',resize);game?.destroy(true);scene=null;pending=null;},
  };
  function resize(){
    if(destroyed||!game?.scale)return;
    const nextDpr=clip(globalThis.devicePixelRatio||1,1,2),nextHeight=measureViewHeight();
    if(nextDpr!==dpr||nextHeight!==viewHeight){
      const camera=scene?.cameras.main,center=camera?.getWorldPoint(camera.width/2,camera.height/2);
      dpr=nextDpr;viewHeight=nextHeight;fitZoom=Math.min(VIEW_WIDTH/W,viewHeight/H);
      // FIT needs setGameSize to update its retained display aspect ratio.
      // resize is intended for NONE and keeps the old FIT ratio on live resize.
      game.scale.setGameSize(VIEW_WIDTH*dpr,viewHeight*dpr);
      scene?.applyCamera();if(center)camera.centerOn(center.x,center.y);
    }
    game.scale.refresh();notifyCamera(true);
  }
  if(!Phaser?.Game||!host){reportError(new Error('Phaser 場景無法啟動，請重新整理頁面。'));return api;}

  class TownScene extends Phaser.Scene{
    constructor(){super('v5-town');this.ready=false;this.built=false;this.characters=new Map();this.bubbles=[];this.ambientTweens=[];this.ambientLights=[];this.frame=null;this.options={};this.drag=null;this.keys=new Set();this.visitor=null;this.objectHighlight=null;}
    preload(){
      // The furniture atlas is optional: if it is missing the code-drawn furniture is used instead.
      this.load.once('loaderror',file=>{if(file?.key===townAssets.FURNITURE_ATLAS_KEY)return;this.assetError=new Error(`小鎮美術載入失敗：${file?.key||'場景素材'}`);reportError(this.assetError);});townAssets.preloadTownAssets?.(this);
    }
    create(){
      try{
        if(this.assetError)return;scene=this;this.ready=true;this.cameras.main.setBounds(0,0,W,H).setRoundPixels(true);this.applyCamera(true);
        const canvas=this.game.canvas;canvas.tabIndex=0;canvas.setAttribute('role','application');canvas.setAttribute('aria-label','AI 小鎮。點居民可觀察，拖曳可看地圖。進入散步模式後，點地面或按方向鍵移動，按 E 查看附近家具。');canvas.style.cursor='grab';canvas.style.touchAction='none';
        this.input.on('pointerdown',p=>{canvas.focus({preventScroll:true});this.drag={x:p.x,y:p.y,scrollX:this.cameras.main.scrollX,scrollY:this.cameras.main.scrollY,moved:false};});
        this.input.on('pointermove',p=>{
          if(!this.drag||!p.isDown){this.hoverObject(p);return;}
          const dx=p.x-this.drag.x,dy=p.y-this.drag.y;if(Math.hypot(dx,dy)>6*dpr)this.drag.moved=true;
          if(this.drag.moved){if(following||explorerFollowing){following=false;explorerFollowing=false;this.cameras.main.stopFollow();notifyCamera();}this.cameras.main.setScroll(this.drag.scrollX-dx/(zoom*dpr*fitZoom),this.drag.scrollY-dy/(zoom*dpr*fitZoom));notifyCamera();canvas.style.cursor='grabbing';}
        });
        this.input.on('pointerup',p=>this.finishPointer(p));this.input.on('pointerupoutside',()=>{this.drag=null;canvas.style.cursor=exploring?'crosshair':'grab';});
        this.handleKeyDown=event=>{
          if(!exploring||document.activeElement!==canvas||document.querySelector('dialog[open]')||event.ctrlKey||event.metaKey||event.altKey)return;
          const key=event.key.toLowerCase();if(WALK_KEYS.has(key)){event.preventDefault();this.keys.add(key);}if(key==='e'&&!event.repeat){event.preventDefault();this.inspectNearestObject();}
        };
        this.handleKeyUp=event=>this.keys.delete(event.key.toLowerCase());this.clearKeys=()=>this.keys.clear();
        document.addEventListener('keydown',this.handleKeyDown);document.addEventListener('keyup',this.handleKeyUp);globalThis.addEventListener('blur',this.clearKeys);canvas.addEventListener('blur',this.clearKeys);
        this.events.once('shutdown',()=>{this.ready=false;this.input.removeAllListeners();this.bubbles=[];this.characters.clear();this.keys.clear();document.removeEventListener('keydown',this.handleKeyDown);document.removeEventListener('keyup',this.handleKeyUp);globalThis.removeEventListener('blur',this.clearKeys);canvas.removeEventListener('blur',this.clearKeys);});
        if(pending)this.applyFrame(pending);
        // Open on the lived-in shared apartment; "全鎮視角" still shows the whole town.
        zoom=clampZoom(2.4);this.applyCamera();this.cameras.main.stopFollow().centerOn(HERO_FOCUS[0],HERO_FOCUS[1]);
        onReady({renderer:this.game.renderer.type===Phaser.WEBGL?'WebGL':'Canvas',version:Phaser.VERSION,minimapUrl:createMinimapDataUrl()});notifyCamera();notifyExplore('',true);
      }catch(error){reportError(error);}
    }
    hitObject(point){return MAP_OBJECTS.filter(o=>point.x>=o.x&&point.x<=o.x+o.width&&point.y>=o.y-12&&point.y<=o.y+o.height).sort((a,b)=>b.y+b.height-a.y-a.height)[0]||null;}
    hoverObject(pointer){
      if(!this.built)return;const point=this.cameras.main.getWorldPoint(pointer.x,pointer.y),object=this.hitObject(point);
      if(this.objectHighlight){this.objectHighlight.clear();if(object)this.objectHighlight.lineStyle(2,0xf5d483,.85).strokeRoundedRect(object.x-3,object.y-4,object.width+6,object.height+7,4);}
      this.game.canvas.style.cursor=object?'pointer':exploring?'crosshair':'grab';
    }
    finishPointer(pointer){
      const drag=this.drag;this.drag=null;this.game.canvas.style.cursor=exploring?'crosshair':'grab';if(!drag||drag.moved)return;
      const point=this.cameras.main.getWorldPoint(pointer.x,pointer.y);
      const hit=[...this.characters.values()].filter(c=>Math.abs(c.container.x-point.x)<29&&point.y<c.container.y+SEATED_OFFSET+9&&point.y>c.container.y-84).sort((a,b)=>b.container.y-a.container.y)[0];
      if(hit){onSelect(hit.id);return;}
      const object=this.hitObject(point);
      if(object){if(exploring&&object.approach)this.walkVisitor(object.approach,{object});else onInspectObject(object);return;}
      if(exploring){if(!isWalkable(point.x,point.y)){notifyExplore('這裡有牆壁或家具，請點選地板、門口或步道。',true);return;}this.walkVisitor(nearestWalkable([point.x,point.y]));}
    }
    applyCamera(reset=false){
      if(!this.ready)return;const camera=this.cameras.main,center=camera.getWorldPoint(camera.width/2,camera.height/2);camera.setZoom(fitZoom*zoom*dpr);
      // At whole-town zoom the viewport may be wider or taller than the map.
      // Symmetric padding preserves centering; zoomed views retain world bounds.
      const padX=Math.max(0,(camera.width/camera.zoom-W)/2),padY=Math.max(0,(camera.height/camera.zoom-H)/2);
      camera.setBounds(-padX,-padY,W+padX*2,H+padY*2);
      if(reset)camera.stopFollow().centerOn(W/2,H/2);else camera.centerOn(Number.isFinite(center.x)?center.x:W/2,Number.isFinite(center.y)?center.y:H/2);
      const target=exploring&&explorerFollowing?this.visitor?.container:following?this.characters.get(this.options.selected)?.container:null;
      if(target)camera.startFollow(target,true,this.options.reducedMotion?1:.14,this.options.reducedMotion?1:.14);else camera.stopFollow();
      this.updateBadges();
    }
    text(x,y,content,size=13,color='#3e5144',extra={}){return this.add.text(x,y,content,{fontFamily:FONT,fontSize:`${size}px`,color,resolution:2,...extra});}
    updateBadges(){
      // Keep the room readable: names identify everyone, while the selected
      // resident carries the detailed activity and equipment labels.
      for(const actor of this.characters.values()){
        const selected=actor.id===this.options.selected;
        actor.name.setVisible(zoom>=1.4||selected).setColor(selected?'#ffffff':'#f3f4e9');
        actor.name.setBackgroundColor(selected?'#285649':'#354a43');
        actor.action.setVisible(selected);
        actor.equipment.setVisible(selected&&!!actor.presentation?.held);
      }
    }
    build(frame){
      const assets=townAssets.registerTownAssets(this,frame.agents);this.assets=assets;if(!this.textures.exists(assets.backgroundKey))throw new Error('小鎮背景尚未載入完成。');
      this.add.image(0,0,assets.backgroundKey).setOrigin(0,0).setDisplaySize(W,H).setDepth(0);for(const layer of assets.foreground)this.add.image(layer.x,layer.y,layer.key).setOrigin(0,0).setScale(layer.scale||1).setDepth(layer.depth);
      const fountain=assets.ambient?.fountain;
      if(fountain)for(let i=0;i<3;i++){const ripple=this.add.ellipse(fountain.x,fountain.y,(fountain.radius||34)+i*14,10+i*5).setStrokeStyle(1,0xf3fff9,.55).setDepth(fountain.y-2);this.ambientTweens.push(this.tweens.add({targets:ripple,scaleX:1.16,scaleY:1.14,alpha:.18,duration:1300+i*270,yoyo:true,repeat:-1,paused:true,delay:i*200}));}
      for(const lamp of assets.ambient?.lamps||[]){this.ambientLights.push(this.add.ellipse(lamp.x,lamp.y,64,64,0xffdf8e,1).setAlpha(0).setDepth(3005));this.ambientLights.push(this.add.ellipse(lamp.x,lamp.y,22,22,0xffeab3,1).setAlpha(0).setDepth(3006));}
      this.phaseOverlay=this.add.rectangle(0,0,W,H,0x485677,1).setAlpha(0).setOrigin(0,0).setDepth(3000);this.equipmentLabels={};
      for(const [zone,position] of Object.entries(assets.equipmentLabels||{}))this.equipmentLabels[zone]=this.text(position.x,position.y,'',13,'#43575d',{backgroundColor:'#f9f6ea',padding:{x:7,y:5}}).setDepth(3300);
      this.objectHighlight=this.add.graphics().setDepth(3500);for(const [index,agent] of frame.agents.entries())this.addCharacter(agent,assets.characterKeys[agent.id],index);
      this.buildVisitor();this.built=true;this.toggleExplore();
    }
    registerCharacterAnimations(id,texture){
      for(const [name,{start,end,...timing}] of Object.entries(characterClips)){const key=`${id}-${name}`;if(this.anims.exists(key))this.anims.remove(key);this.anims.create({key,frames:this.anims.generateFrameNumbers(texture,{start,end}),...timing});}
    }
    addCharacter(agent,texture,index){
      this.registerCharacterAnimations(agent.id,texture);const shadow=this.add.ellipse(0,-1,34,11,0x243b34,.22),ring=this.add.ellipse(0,-1,45,16).setStrokeStyle(2,0xffe0a0).setVisible(false),sprite=this.add.sprite(0,0,texture,0).setOrigin(.5,1).setScale(RESIDENT_SCALE);
      const name=this.text(0,4,agent.name,12,'#f3f4e9',{fontStyle:'bold',backgroundColor:'#354a43',padding:{x:5,y:2}}).setOrigin(.5,0);
      const action=this.text(0,25,'',10,'#526350',{backgroundColor:'#f4eedb',padding:{x:4,y:2}}).setOrigin(.5,0);
      const equipment=this.text(24,-73,'',10,'#fffaf0',{backgroundColor:'#285649',padding:{x:4,y:2}}).setOrigin(0,1).setVisible(false);
      const container=this.add.container(0,0,[shadow,ring,sprite]);
      // Furniture occludes the body by foot position, but names and activity
      // labels stay readable when someone sits beside a southern wall.
      const badges=this.add.container(0,0,[name,action,equipment]).setDepth(3400+index);
      this.characters.set(agent.id,{id:agent.id,container,badges,sprite,shadow,ring,name,action,equipment,appearance:appearanceIdentity(agent,index),direction:'down',zone:agent.zone,path:null,motion:null,poseTween:null,transitioning:false,seated:false,moving:false,presentation:null,animationKey:null,anchor:null});
    }
    syncCharacters(frame){
      const changed=frame.agents.some((agent,index)=>this.characters.get(agent.id)?.appearance!==appearanceIdentity(agent,index));for(const agent of frame.agents){const actor=this.characters.get(agent.id);if(actor&&actor.name.text!==agent.name)actor.name.setText(agent.name);}if(!changed)return false;
      const assets=townAssets.registerTownAssets(this,frame.agents);this.assets=assets;
      for(const [index,agent] of frame.agents.entries()){const actor=this.characters.get(agent.id),identity=appearanceIdentity(agent,index);if(!actor){this.addCharacter(agent,assets.characterKeys[agent.id],index);continue;}if(actor.appearance===identity)continue;actor.motion?.stop();actor.poseTween?.stop();actor.motion=actor.poseTween=null;actor.transitioning=false;actor.seated=false;actor.moving=false;this.bodyOffset(actor,0);actor.sprite.anims.stop();actor.animationKey=null;this.registerCharacterAnimations(agent.id,assets.characterKeys[agent.id]);actor.sprite.setTexture(assets.characterKeys[agent.id],0);actor.appearance=identity;actor.direction='down';}
      return true;
    }
    play(actor,name,active){
      const key=`${actor.id}-${name}`;
      if(actor.animationKey!==key){actor.sprite.play(key,true);actor.animationKey=key;}
      actor.sprite.anims.timeScale=motionRate(this.options.duration);
      if(active)actor.sprite.anims.resume();else actor.sprite.anims.pause();
    }
    bodyOffset(actor,y){
      actor.sprite.setScale(RESIDENT_SCALE).setY(y);
      actor.shadow.setY(y>0?y-2:-1).setScale(y>0?.8:1);
      actor.badges.setPosition(actor.container.x,actor.container.y+Math.max(0,y));
    }
    posture(actor,seated,complete){
      const from=actor.sprite.y,to=seated?SEATED_OFFSET:0,progress={value:0};
      actor.poseTween?.stop();actor.sprite.anims.stop();actor.animationKey=null;actor.transitioning=true;
      const start=characterClips[`sit-${actor.direction}`].start;actor.poseSpeed=motionRate(this.options.duration);
      actor.poseTween=this.tweens.add({targets:progress,value:1,duration:480/motionRate(this.options.duration),ease:'Sine.easeInOut',onUpdate:()=>{
        const t=progress.value;this.bodyOffset(actor,from+(to-from)*t);
        actor.sprite.setFrame(start+Math.min(3,Math.floor((seated?t:1-t)*4)));
      },onComplete:()=>{actor.poseTween=null;actor.transitioning=false;actor.seated=seated;this.bodyOffset(actor,to);complete?.();this.layoutBubbles();}});
    }
    settle(actor,animate=false){
      actor.moving=false;const p=actor.presentation;if(!p||actor.transitioning)return;
      if(actor.anchor?.facing)actor.direction=actor.anchor.facing;
      if(p.target&&!actor.anchor?.seated){const target=this.characters.get(p.target);if(target)actor.direction=directionBetween([actor.container.x,actor.container.y],[target.container.x,target.container.y],actor.direction);}
      const seated=!!actor.anchor?.seated,pose=seatedPose(p,actor.anchor);
      const finished=()=>{actor.seated=seated;this.bodyOffset(actor,seated?SEATED_OFFSET:0);const directional=`${pose}-${actor.direction}`;this.play(actor,characterClips[directional]?directional:pose,this.options.playing&&!this.options.reducedMotion);};
      if(animate&&!this.options.reducedMotion&&actor.seated!==seated)this.posture(actor,seated,finished);else finished();
    }
    place(actor,point){actor.container.setPosition(point[0],point[1]).setDepth(point[1]+.1);actor.badges.setPosition(point[0],point[1]+Math.max(0,actor.sprite.y));}
    walk(actor,destination,distance){
      const begin=()=>{
        this.bodyOffset(actor,0);actor.seated=false;actor.moving=true;actor.sprite.anims.stop();actor.animationKey=null;
        const progress={value:0};actor.motionSpeed=motionRate(this.options.duration);
        actor.motion=this.tweens.add({targets:progress,value:1,duration:walkDuration(distance,this.options.duration),ease:'Linear',onUpdate:()=>{
          const next=samplePath(actor.path,progress.value);actor.direction=directionBetween([actor.container.x,actor.container.y],next,actor.direction);this.place(actor,next);
          // Match stride to ground travelled rather than looping unrelated feet.
          actor.sprite.setFrame(characterClips[actor.direction].start+Math.floor(progress.value*distance/72*8)%8);
        },onComplete:()=>{actor.motion=null;this.place(actor,destination);this.settle(actor,true);this.layoutBubbles();}});
      };
      actor.moving=true;
      if(actor.seated)this.posture(actor,false,begin);else begin();
    }
    applyFrame({frame,options}){
      if(!frame)return;if(!this.built)this.build(frame);const identitiesChanged=this.syncCharacters(frame),previous=this.frame,oldOptions=this.options;
      const same=!identitiesChanged&&previous&&previous.tick===frame.tick&&previous.config.seed===frame.config.seed&&previous.config.capacity===frame.config.capacity,continuous=!identitiesChanged&&isContinuousFrame(previous,frame);this.frame=frame;this.options=options;
      for(const agent of frame.agents){
        const actor=this.characters.get(agent.id);if(!actor)continue;actor.ring.setVisible(agent.id===options.selected);
        if(same){
          if(actor.motion)actor.motion.timeScale=motionRate(options.duration)/(actor.motionSpeed||1);
          if(actor.poseTween)actor.poseTween.timeScale=motionRate(options.duration)/(actor.poseSpeed||1);
          if(options.reducedMotion&&(actor.moving||actor.transitioning)){
            actor.motion?.stop();actor.poseTween?.stop();actor.motion=actor.poseTween=null;actor.transitioning=false;
            this.place(actor,actor.destination);this.settle(actor);
          }else if(actor.moving||actor.transitioning){
            if(options.playing){actor.motion?.resume();actor.poseTween?.resume();}
            else if(oldOptions.playing||options.animate===false){actor.motion?.pause();actor.poseTween?.pause();actor.sprite.anims.pause();}
          }else this.settle(actor);
          continue;
        }
        // Complete an interrupted display step before deriving its next grid path.
        if(continuous&&actor.moving&&actor.destination)this.place(actor,actor.destination);
        actor.motion?.stop();actor.poseTween?.stop();actor.motion=actor.poseTween=null;actor.transitioning=false;actor.presentation=characterPresentation(frame,agent.id);actor.anchor=activityAnchor(agent,frame);const p=actor.presentation;
        actor.action.setText(p.failed?'未能執行':actor.anchor?.label||(p.proposal?ACTION_NAMES[p.proposal.action]:'觀察中')).setColor(p.failed?'#a46e51':'#6e7768');actor.equipment.setVisible(!!p.held);if(p.held)actor.equipment.setText(`${p.held.type==='camera'?'相機':'工具'}${p.held.usableFrom>frame.tick?' · 下步可用':''}`);
        const destination=characterPosition(agent,frame),from=previous?[actor.container.x,actor.container.y]:destination,oldAgent=previous?.agents.find(a=>a.id===agent.id);
        actor.path=presentationPath(from,destination,oldAgent?.zone??agent.zone,agent.zone);actor.destination=destination;actor.zone=agent.zone;const distance=pathLength(actor.path);
        if(continuous&&options.animate!==false&&!options.reducedMotion&&distance>1){
          this.walk(actor,destination,distance);
        }else{this.place(actor,destination);this.settle(actor,continuous&&options.animate!==false);}
      }
      if(!same){for(const actor of this.characters.values())if(!actor.moving)this.settle(actor);this.makeBubbles(frame,options.selected);this.updateWorldLabels(frame);}else if(oldOptions.selected!==options.selected)this.makeBubbles(frame,options.selected);
      for(const tween of this.ambientTweens){if(options.playing&&!options.reducedMotion)tween.resume();else tween.pause();}this.updateBadges();if(following&&oldOptions.selected!==options.selected)this.applyCamera();this.layoutBubbles();
    }
    updateWorldLabels(frame){
      for(const [zone,label] of Object.entries(this.equipmentLabels)){const items=frame.equipment.filter(e=>e.zone===zone),held=items.filter(e=>e.owner);label.setText(`${zone==='workshop'?'工具':'相機'}  ${items.length-held.length}/${items.length} 可借${held.length?` · ${held.length} 持有`:''}`);}
      const slot=(Math.max(1,frame.tick)-1)%12;this.phaseOverlay.setAlpha(slot>=9?.12:slot>=6?.035:0);this.ambientLights.forEach((light,i)=>light.setAlpha(slot>=9?(i%2?.52:.16):0));
    }
    makeBubbles(frame,selected){
      for(const bubble of this.bubbles)bubble.container.destroy();this.bubbles=[];
      for(const event of visibleUtterances(frame,selected,3)){
        const actor=this.characters.get(event.participants[0]);if(!actor)continue;const speaker=frame.agents.find(a=>a.id===actor.id)?.name??'',content=String(event.text).slice(0,64);
        const text=this.text(12,29,wrap(content)+(event.text.length>64?'…':''),13,'#405044',{lineSpacing:4}),width=Math.min(256,Math.max(164,text.width+24)),height=text.height+42;
        const graphics=this.add.graphics();graphics.fillStyle(0x3b513d,.10).fillRoundedRect(3,4,width,height,8);graphics.fillStyle(0xfffcf3,.98).fillRoundedRect(0,0,width,height,8);graphics.lineStyle(1,event.participants[0]===selected?0x689879:0xb9c7a8,1).strokeRoundedRect(0,0,width,height,8);graphics.fillStyle(0xfffcf3,1).fillTriangle(width/2-6,height-1,width/2+6,height-1,width/2,height+9);
        const title=this.text(12,8,`${speaker} · ${ACTION_NAMES[event.type]||'交談'}`,11,'#8c805e',{fontStyle:'bold'}),container=this.add.container(0,0,[graphics,title,text]).setDepth(6000+this.bubbles.length);this.bubbles.push({actor,container,width,height,event});
      }
      this.layoutBubbles();
    }
    layoutBubbles(){
      const placed=[];
      for(const bubble of this.bubbles){const {actor,container,width,height}=bubble;container.setVisible(!actor.moving&&!actor.transitioning);const idealX=actor.container.x-width/2,idealY=actor.container.y-height-88,candidates=[];
        for(const dy of [0,-height-12,height+118])for(const dx of [0,-width-8,width+8]){const x=clip(idealX+dx,10,W-width-10),y=clip(idealY+dy,8,H-height-10),overlaps=placed.reduce((sum,p)=>sum+(x<p.x+p.width+8&&x+width+8>p.x&&y<p.y+p.height+8&&y+height+8>p.y?1:0),0);candidates.push({x,y,score:overlaps*10000000+(x-idealX)**2+(y-idealY)**2});}
        const {x,y}=candidates.sort((a,b)=>a.score-b.score)[0];container.setPosition(x,y);placed.push({x,y,width,height});
      }
    }
    buildVisitor(){
      const key='town-observer-v1';
      if(!this.textures.exists(key)){
        const canvas=document.createElement('canvas');canvas.width=32*16;canvas.height=48;const c=canvas.getContext('2d'),r=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
        for(let frame=0;frame<16;frame++){
          c.save();c.translate(frame*32,0);const direction=Math.floor(frame/4),phase=frame%4,stride=[0,2,0,-2][phase],back=direction===3,side=direction===1||direction===2;if(direction===1){c.translate(32,0);c.scale(-1,1);}
          r(9,32,6,10+stride,'#344f67');r(18,32,6,10-stride,'#233e54');r(8,41+stride,8,4,'#253940');r(17,41-stride,9,4,'#253940');r(8,20,17,14,'#dbeadf');r(9,22,3,12,'#adc9bf');r(11,32,12,2,'#a9bfb3');r(5,22+stride,4,13,'#cee0d4');r(5,33+stride,4,4,'#e7b58e');r(25,22-stride,3,13,'#9cbdb1');r(25,33-stride,3,4,'#d9a27f');
          if(back){r(11,22,11,14,'#447f92');r(13,24,7,7,'#7fafba');r(13,33,7,2,'#315e78');}else{r(12,21,2,13,'#599098');r(21,21,2,13,'#599098');r(13,25,8,4,'#f8faf0');}
          r(10,8,14,13,'#e8b78f');r(10,9,3,9,'#cd9571');r(9,5,15,8,'#30595b');r(8,8,18,4,'#447d79');r(10,4,13,5,'#5e9a8a');if(back)r(10,12,14,7,'#3c4542');else{r(side?21:14,14,2,2,'#354747');if(!side)r(21,14,2,2,'#354747');r(side?23:18,18,3,1,'#aa735e');}c.restore();
        }
        this.textures.addSpriteSheet(key,canvas,{frameWidth:32,frameHeight:48});
      }
      const spawn=nearestWalkable([W/2,H/2]),shadow=this.add.ellipse(0,-1,27,9,0x243b34,.24),halo=this.add.ellipse(0,-1,39,14).setStrokeStyle(2,0x59b8af,.9),sprite=this.add.sprite(0,0,key,0).setOrigin(.5,1);
      const label=this.text(0,5,'我 · 訪客',12,'#f9fffb',{backgroundColor:'#317a78',padding:{x:6,y:3}}).setOrigin(.5,0),container=this.add.container(spawn[0],spawn[1],[shadow,halo,sprite]).setDepth(spawn[1]+.2).setVisible(false);
      const badges=this.add.container(spawn[0],spawn[1],[label]).setDepth(3490).setVisible(false);
      const marker=this.add.ellipse(0,0,22,12).setStrokeStyle(2,0x399d94,.8).setVisible(false).setDepth(3200),route=this.add.graphics().setDepth(2);
      this.visitor={container,badges,sprite,marker,route,moving:false,path:[],distance:0,progress:0,direction:'down',walkPhase:0,pendingObject:null,keyboardStep:false};
    }
    toggleExplore(){if(!this.visitor)return;this.keys.clear();this.visitor.container.setVisible(exploring);this.visitor.badges.setVisible(exploring);if(!exploring){this.stopVisitor();this.objectHighlight?.clear();}else this.game.canvas.focus({preventScroll:true});this.game.canvas.style.cursor=exploring?'crosshair':'grab';}
    stopVisitor(){const v=this.visitor;if(!v)return;v.moving=false;v.pendingObject=null;v.path=[];v.marker.setVisible(false);v.route.clear();v.sprite.setFrame(idleFrames[v.direction]*4);notifyExplore();}
    walkVisitor(destination,{object=null,keyboard=false}={}){
      const v=this.visitor;if(!exploring||!v||!destination)return false;const from=[v.container.x,v.container.y];
      // Finish the partial current cell segment before rerouting: no teleport
      // across adjacent walls or diagonal cuts through narrow door corners.
      const snapped=nearestWalkable(from),target=nearestWalkable(destination),route=findWalkPath(snapped,target);
      if(!route.length){notifyExplore('目前沒有能走到這裡的通道。',true);return false;}
      const path=Math.hypot(from[0]-snapped[0],from[1]-snapped[1])>.1?[from,snapped,...route.slice(1)]:route,distance=pathLength(path);
      v.pendingObject=object;v.keyboardStep=keyboard;v.path=path;v.distance=distance;v.progress=0;following=false;explorerFollowing=true;this.applyCamera();
      if(distance<1){if(object)onInspectObject(object);this.stopVisitor();return true;}
      v.moving=true;v.marker.setPosition(target[0],target[1]).setVisible(!keyboard);v.route.clear();
      if(!keyboard){v.route.lineStyle(2,0x5b9c8b,.45);v.route.beginPath();path.forEach((point,i)=>i?v.route.lineTo(...point):v.route.moveTo(...point));v.route.strokePath();}
      notifyExplore(object?`走近${object.name}`:'',true);return true;
    }
    inspectNearestObject(){
      const v=this.visitor;if(!v)return;
      const from=[v.container.x,v.container.y],limit=TILE_SIZE*2.25;
      const nearby=MAP_OBJECTS.filter(o=>o.approach&&Math.hypot(o.approach[0]-from[0],o.approach[1]-from[1])<=limit).map(object=>{
        const path=findWalkPath(from,object.approach);return {object,distance:path.length?pathLength(path):Infinity};
      }).filter(item=>item.distance<=limit).sort((a,b)=>a.distance-b.distance)[0];
      if(nearby)onInspectObject(nearby.object);else notifyExplore('走近桌椅、書架或工作檯，再按 E 查看。',true);
    }
    updateVisitor(delta){
      const v=this.visitor;if(!exploring||!v)return;const canvasFocused=document.activeElement===this.game.canvas&&!document.querySelector('dialog[open]');if(!canvasFocused)this.keys.clear();
      const requested=this.keys.has('w')||this.keys.has('arrowup')?[0,-1,'up']:this.keys.has('s')||this.keys.has('arrowdown')?[0,1,'down']:this.keys.has('a')||this.keys.has('arrowleft')?[-1,0,'left']:this.keys.has('d')||this.keys.has('arrowright')?[1,0,'right']:null;
      if(requested&&(!v.moving||!v.keyboardStep)){const from=nearestWalkable([v.container.x,v.container.y]),target=[from[0]+requested[0]*TILE_SIZE,from[1]+requested[1]*TILE_SIZE];v.direction=requested[2];if(isWalkable(...target))this.walkVisitor(target,{keyboard:true});else v.sprite.setFrame(idleFrames[v.direction]*4);}
      if(!v.moving)return;
      // A released key completes at most its current tile. Point-and-walk is
      // independent and continues to its selected destination.
      v.progress=Math.min(v.distance,v.progress+Math.min(delta,50)*.19);const before=[v.container.x,v.container.y],point=samplePath(v.path,v.distance?v.progress/v.distance:1);
      v.direction=directionBetween(before,point,v.direction);v.container.setPosition(...point).setDepth(point[1]+.2);v.badges.setPosition(...point);v.walkPhase+=Math.min(delta,50);v.sprite.setFrame(idleFrames[v.direction]*4+(this.options.reducedMotion?0:Math.floor(v.walkPhase/120)%4));
      if(v.progress>=v.distance){const object=v.pendingObject;this.stopVisitor();if(object)onInspectObject(object);}notifyExplore();
    }
    update(time,delta){
      this.updateVisitor(delta);if(this.bubbles.some(b=>b.actor.moving||b.actor.transitioning))this.layoutBubbles();notifyCamera();
      // Rendered positions are exposed for playback/accessibility diagnostics,
      // never read by the simulation or used to determine research outcomes.
      if(this.built)this.game.canvas.dataset.residentStates=JSON.stringify([...this.characters.values()].map(a=>({id:a.id,x:Math.round(a.container.x),y:Math.round(a.container.y),offset:Math.round(a.sprite.y),scale:a.sprite.scaleX,frame:Number(a.sprite.frame.name),moving:a.moving,transitioning:a.transitioning,seated:a.seated})));
    }
  }
  try{
    game=new Phaser.Game({
      type:Phaser.AUTO,parent:host,width:VIEW_WIDTH*dpr,height:viewHeight*dpr,backgroundColor:'#dce5c5',banner:false,
      scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH,width:VIEW_WIDTH*dpr,height:viewHeight*dpr,expandParent:false},
      // Load same-origin art directly. The default XHR loader creates a blob URL.
      loader:{imageLoadType:'HTMLImageElement'},
      render:{pixelArt:true,roundPixels:true},audio:{noAudio:true},fps:{target:60},scene:TownScene,
    });
    if(globalThis.ResizeObserver){resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);}globalThis.addEventListener('resize',resize);
  }catch(error){reportError(error);}
  return api;
}
