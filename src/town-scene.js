import { ACTION_NAMES } from './config.js';
import { registerTownAssets } from './town-assets.js';
import { WORLD_SIZE, clampZoom, isContinuousFrame, characterPosition, presentationPath, samplePath, directionBetween, characterPresentation, visibleUtterances } from './town-view-model.js';

const { width: W, height: H } = WORLD_SIZE;
const FONT = '"Microsoft JhengHei", "Noto Sans TC", sans-serif';
const idleFrames = { down:0, left:1, right:2, up:3 };
const characterClips = {down:[4,7],left:[8,11],right:[12,15],up:[16,19],work:[20,23],rest:[24,25],talk:[26,27],camera:[28,29]};
const appearanceIdentity = (agent,index) => JSON.stringify([agent.id,agent.name,agent.color,index]);
const clip = (n,a,b) => Math.max(a,Math.min(b,n));
const wrap = (text, columns=17) => Array.from(String(text)).reduce((lines,c,i) => { if(i%columns===0)lines.push('');lines[lines.length-1]+=c;return lines;},[]).join('\n');

// This scene consumes completed V5 world frames. It never chooses an action,
// changes a world frame, or feeds display coordinates back to the simulation.
export function createTownScene(host, { onSelect=()=>{}, onCameraChange=()=>{}, onReady=()=>{}, onError=()=>{} } = {}) {
  const Phaser = globalThis.Phaser;
  let game, scene, pending=null, destroyed=false, observer;
  let zoom=1, following=false, dpr=clip(globalThis.devicePixelRatio||1,1,2);
  const notifyCamera = () => onCameraChange({zoom,following});
  const reportError = error => { if(!destroyed)onError(error instanceof Error ? error : new Error(String(error))); };
  const api = {
    render(frame, options={}) {
      if(destroyed)return;
      pending={frame,options:{selected:null,playing:false,duration:800,reducedMotion:false,animate:true,...options}};
      if(scene?.ready)try { scene.applyFrame(pending); } catch(error) { reportError(error); }
    },
    zoomIn() { zoom=clampZoom(zoom+.25);scene?.applyCamera();notifyCamera(); },
    zoomOut() { zoom=clampZoom(zoom-.25);scene?.applyCamera();notifyCamera(); },
    resetCamera() { zoom=1;following=false;scene?.applyCamera(true);notifyCamera(); },
    setFollow(value) { following=!!value;if(following)zoom=Math.max(1.5,zoom);scene?.applyCamera();notifyCamera(); },
    destroy() { if(destroyed)return;destroyed=true;observer?.disconnect();globalThis.removeEventListener('resize',resize);game?.destroy(true);scene=null;pending=null; },
  };
  function resize() {
    if(destroyed||!game?.scale)return;
    const nextDpr=clip(globalThis.devicePixelRatio||1,1,2);
    if(nextDpr!==dpr){
      const camera=scene?.cameras.main,center=camera?.getWorldPoint(camera.width/2,camera.height/2);
      dpr=nextDpr;game.scale.resize(W*dpr,H*dpr);scene?.applyCamera();
      if(center)camera.centerOn(center.x,center.y);
    }
    game.scale.refresh();
  }
  if(!Phaser?.Game || !host){reportError(new Error('Phaser 場景無法啟動，請重新整理頁面。'));return api;}

  class TownScene extends Phaser.Scene {
    constructor(){super('v5-town');this.ready=false;this.built=false;this.characters=new Map();this.bubbles=[];this.ambientTweens=[];this.ambientLights=[];this.frame=null;this.options={};this.drag=null;}
    create(){
      try {
        scene=this;this.ready=true;
        this.cameras.main.setBounds(0,0,W,H).setRoundPixels(true);
        this.applyCamera(true);
        this.input.on('pointerdown',p=>{this.drag={x:p.x,y:p.y,scrollX:this.cameras.main.scrollX,scrollY:this.cameras.main.scrollY,moved:false};});
        this.input.on('pointermove',p=>{
          if(!this.drag||!p.isDown)return;
          const dx=p.x-this.drag.x,dy=p.y-this.drag.y;
          if(Math.hypot(dx,dy)>6*dpr)this.drag.moved=true;
          if(this.drag.moved){
            if(following){following=false;this.cameras.main.stopFollow();notifyCamera();}
            this.cameras.main.setScroll(this.drag.scrollX-dx/(zoom*dpr),this.drag.scrollY-dy/(zoom*dpr));
            if(game?.canvas)game.canvas.style.cursor='grabbing';
          }
        });
        this.input.on('pointerup',p=>this.finishPointer(p));
        this.input.on('pointerupoutside',()=>{this.drag=null;if(game?.canvas)game.canvas.style.cursor='grab';});
        this.events.once('shutdown',()=>{this.ready=false;this.input.removeAllListeners();this.bubbles=[];this.characters.clear();});
        if(pending)this.applyFrame(pending);
        const canvas=this.game.canvas;
        canvas.setAttribute('role','img');canvas.setAttribute('aria-label','AI 小鎮：可點選居民觀察、拖曳平移，使用上方按鈕縮放。');
        canvas.style.cursor='grab';canvas.style.touchAction='none';
        onReady({renderer:this.game.renderer.type===Phaser.WEBGL?'WebGL':'Canvas',version:Phaser.VERSION});notifyCamera();
      } catch(error){reportError(error);}
    }
    finishPointer(pointer){
      const drag=this.drag;this.drag=null;if(this.game.canvas)this.game.canvas.style.cursor='grab';
      if(!drag||drag.moved)return;
      const point=this.cameras.main.getWorldPoint(pointer.x,pointer.y);
      const hit=[...this.characters.values()].filter(c=>Math.abs(c.container.x-point.x)<27&&point.y<c.container.y+10&&point.y>c.container.y-61).sort((a,b)=>b.container.y-a.container.y)[0];
      if(hit)onSelect(hit.id);
    }
    applyCamera(reset=false){
      if(!this.ready)return;
      const camera=this.cameras.main;
      const center=camera.getWorldPoint(camera.width/2,camera.height/2);
      camera.setZoom(zoom*dpr);
      if(reset)camera.stopFollow().centerOn(W/2,H/2);
      else camera.centerOn(Number.isFinite(center.x)?center.x:W/2,Number.isFinite(center.y)?center.y:H/2);
      const actor=this.characters.get(this.options.selected);
      if(following&&actor)camera.startFollow(actor.container,true,.12,.12);
      else camera.stopFollow();
    }
    text(x,y,content,size=13,color='#3e5144',extra={}){
      return this.add.text(x,y,content,{fontFamily:FONT,fontSize:`${size}px`,color,resolution:2,...extra});
    }
    build(frame){
      const assets=registerTownAssets(this,frame.agents);this.assets=assets;
      this.add.image(0,0,assets.backgroundKey).setOrigin(0,0).setDepth(0);
      for(const layer of assets.foreground)this.add.image(layer.x,layer.y,layer.key).setOrigin(0,0).setDepth(layer.depth);
      const fountain=assets.ambient.fountain;
      for(let i=0;i<3;i++){
        const ripple=this.add.ellipse(fountain.x,fountain.y,22+i*19,8+i*6).setStrokeStyle(1,0xf3fff9,.55).setDepth(fountain.y-2);
        this.ambientTweens.push(this.tweens.add({targets:ripple,scaleX:1.16,scaleY:1.14,alpha:.18,duration:1300+i*270,yoyo:true,repeat:-1,paused:true,delay:i*200}));
      }
      for(const lamp of assets.ambient.lamps){
        this.ambientLights.push(this.add.ellipse(lamp.x,lamp.y,56,56,0xffdf8e,1).setAlpha(0).setDepth(1005));
        this.ambientLights.push(this.add.ellipse(lamp.x,lamp.y,23,23,0xffeab3,1).setAlpha(0).setDepth(1006));
      }
      this.phaseOverlay=this.add.rectangle(0,0,W,H,0x485677,1).setAlpha(0).setOrigin(0,0).setDepth(1000);
      this.phaseLabel=this.text(982,18,'',11,'#526554',{backgroundColor:'#fff9ec',padding:{x:8,y:5}}).setOrigin(1,0).setDepth(1100);
      this.equipmentLabels={
        workshop:this.text(550,326,'',10,'#566450',{backgroundColor:'#fff9ed',padding:{x:7,y:4}}).setDepth(1100),
        studio:this.text(533,611,'',10,'#566450',{backgroundColor:'#fff9ed',padding:{x:7,y:4}}).setDepth(1100),
      };
      for(const [index,agent] of frame.agents.entries())this.addCharacter(agent,assets.characterKeys[agent.id],index);
      this.built=true;
    }
    registerCharacterAnimations(id,texture){
      for(const [name,[start,end]] of Object.entries(characterClips)){
        const key=`${id}-${name}`;
        if(this.anims.exists(key))this.anims.remove(key);
        this.anims.create({key,frames:this.anims.generateFrameNumbers(texture,{start,end}),frameRate:name==='rest'?2:7,repeat:-1});
      }
    }
    addCharacter(agent,texture,index){
      this.registerCharacterAnimations(agent.id,texture);
      const shadow=this.add.ellipse(0,-1,31,10,0x38523e,.2);
      const ring=this.add.ellipse(0,-1,40,15).setStrokeStyle(2,0xf8f5cd).setVisible(false);
      const sprite=this.add.sprite(0,0,texture,0).setOrigin(.5,1);
      const name=this.text(0,8,agent.name,12,'#344c3c',{fontStyle:'bold',backgroundColor:'#fffaf0',padding:{x:5,y:2}}).setOrigin(.5,0);
      const action=this.text(0,28,'',9,'#6e7768',{backgroundColor:'#fffaed',padding:{x:3,y:1}}).setOrigin(.5,0);
      const equipment=this.text(19,-48,'',10,'#fffaf0',{backgroundColor:'#536b5a',padding:{x:3,y:2}}).setOrigin(0,1).setVisible(false);
      const container=this.add.container(0,0,[shadow,ring,sprite,name,action,equipment]);
      this.characters.set(agent.id,{id:agent.id,container,sprite,ring,name,action,equipment,appearance:appearanceIdentity(agent,index),direction:'down',zone:agent.zone,path:null,motion:null,moving:false,presentation:null,animationKey:null});
    }
    syncCharacters(frame){
      // A seed reset can assign a different persona to the same stable actor ID.
      // Reuse the scene; refresh only the names and changed resident artwork.
      const changed=frame.agents.some((agent,index)=>this.characters.get(agent.id)?.appearance!==appearanceIdentity(agent,index));
      for(const agent of frame.agents){const actor=this.characters.get(agent.id);if(actor&&actor.name.text!==agent.name)actor.name.setText(agent.name);}
      if(!changed)return false;
      const assets=registerTownAssets(this,frame.agents);this.assets=assets;
      for(const [index,agent] of frame.agents.entries()){
        const actor=this.characters.get(agent.id),identity=appearanceIdentity(agent,index);
        if(!actor){this.addCharacter(agent,assets.characterKeys[agent.id],index);continue;}
        if(actor.appearance===identity)continue;
        actor.motion?.stop();actor.motion=null;actor.moving=false;
        actor.sprite.anims.stop();actor.animationKey=null;
        this.registerCharacterAnimations(agent.id,assets.characterKeys[agent.id]);
        actor.sprite.setTexture(assets.characterKeys[agent.id],0);
        actor.appearance=identity;actor.direction='down';
      }
      return true;
    }
    play(actor,name,active){
      const key=`${actor.id}-${name}`;
      if(actor.animationKey!==key){actor.sprite.play(key,true);actor.animationKey=key;}
      if(active)actor.sprite.anims.resume();else actor.sprite.anims.pause();
    }
    settle(actor){
      actor.moving=false;
      const p=actor.presentation;
      if(!p)return;
      if(p.target){const target=this.characters.get(p.target);if(target)actor.direction=directionBetween([actor.container.x,actor.container.y],[target.container.x,target.container.y],actor.direction);}
      const active=this.options.playing&&!this.options.reducedMotion;
      // Talk art faces down; side / back idle frames preserve the actual listener direction.
      if(p.pose==='talk'&&actor.direction!=='down'){actor.sprite.anims.stop();actor.sprite.setFrame(idleFrames[actor.direction]);actor.animationKey=null;}
      else if(p.pose!=='idle')this.play(actor,p.pose,active);
      else {actor.sprite.anims.stop();actor.sprite.setFrame(idleFrames[actor.direction]);actor.animationKey=null;}
    }
    place(actor,point){actor.container.setPosition(point[0],point[1]).setDepth(point[1]+.1);}
    applyFrame({frame,options}){
      if(!frame)return;
      if(!this.built)this.build(frame);
      const identitiesChanged=this.syncCharacters(frame);
      const previous=this.frame,oldOptions=this.options;
      const same=!identitiesChanged&&previous&&previous.tick===frame.tick&&previous.config.seed===frame.config.seed&&previous.config.capacity===frame.config.capacity;
      const continuous=!identitiesChanged&&isContinuousFrame(previous,frame);
      this.frame=frame;this.options=options;
      for(const agent of frame.agents){
        const actor=this.characters.get(agent.id);if(!actor)continue;
        actor.ring.setVisible(agent.id===options.selected);
        actor.name.setColor(agent.id===options.selected?'#1d644b':'#344c3c');
        if(same){
          if(options.reducedMotion&&actor.moving){actor.motion?.stop();this.place(actor,actor.destination);this.settle(actor);}
          else if(actor.moving&&oldOptions.playing!==options.playing){if(options.playing){actor.motion?.resume();actor.sprite.anims.resume();}else{actor.motion?.pause();actor.sprite.anims.pause();}}
          else if(!actor.moving)this.settle(actor);
          continue;
        }
        actor.motion?.stop();actor.motion=null;
        actor.presentation=characterPresentation(frame,agent.id);
        const p=actor.presentation;
        actor.action.setText(p.failed?'未能執行':p.proposal?(ACTION_NAMES[p.proposal.action]||'觀察中'):'觀察中').setColor(p.failed?'#a46e51':'#6e7768');
        actor.equipment.setVisible(!!p.held);
        if(p.held)actor.equipment.setText(`${p.held.type==='camera'?'相機':'工具'}${p.held.usableFrom>frame.tick?' · 下步可用':' · 持有'}`);
        const destination=characterPosition(agent,frame);
        const from=previous?[actor.container.x,actor.container.y]:destination;
        const oldAgent=previous?.agents.find(a=>a.id===agent.id);
        actor.path=presentationPath(from,destination,oldAgent?.zone??agent.zone,agent.zone);
        actor.destination=destination;actor.zone=agent.zone;
        const distance=actor.path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-actor.path[i][0],p[1]-actor.path[i][1]),0);
        if(continuous&&options.animate!==false&&!options.reducedMotion&&!p.failed&&distance>1){
          const progress={value:0};actor.moving=true;
          actor.motion=this.tweens.add({targets:progress,value:1,duration:Math.max(160,options.duration),ease:'Linear',onUpdate:()=>{
            const next=samplePath(actor.path,progress.value);actor.direction=directionBetween([actor.container.x,actor.container.y],next,actor.direction);
            this.place(actor,next);this.play(actor,actor.direction,true);
          },onComplete:()=>{this.place(actor,destination);this.settle(actor);this.layoutBubbles();}});
        } else {this.place(actor,destination);this.settle(actor);}
      }
      if(!same){
        // All positions are set before the final facing pass (including an earlier-listed listener).
        for(const actor of this.characters.values())if(!actor.moving)this.settle(actor);
        this.makeBubbles(frame,options.selected);
        this.updateWorldLabels(frame);
      } else if(oldOptions.selected!==options.selected)this.makeBubbles(frame,options.selected);
      const ambientActive=options.playing&&!options.reducedMotion;
      for(const tween of this.ambientTweens){if(ambientActive)tween.resume();else tween.pause();}
      if(following&&oldOptions.selected!==options.selected)this.applyCamera();
      this.layoutBubbles();
    }
    updateWorldLabels(frame){
      for(const [zone,label] of Object.entries(this.equipmentLabels)){
        const items=frame.equipment.filter(e=>e.zone===zone),held=items.filter(e=>e.owner),newly=held.filter(e=>e.usableFrom>frame.tick).length;
        label.setText(`${zone==='workshop'?'工具':'相機'}  ${items.length-held.length}/${items.length} 可借${held.length?` · ${held.length} 持有`:''}${newly?`（${newly} 下步可用）`:''}`);
      }
      const slot=(Math.max(1,frame.tick)-1)%12;
      const phase=slot<3?'晨光':slot<6?'日間':slot<9?'午後':'傍晚';
      const night=slot>=9 ? .12:slot>=6?.035:0;
      this.phaseOverlay.setAlpha(night);
      this.phaseLabel.setText(`${phase} · 氛圍示意`);
      this.ambientLights.forEach((light,i)=>light.setAlpha(slot>=9?(i%2?.52:.16):0));
    }
    makeBubbles(frame,selected){
      for(const bubble of this.bubbles)bubble.container.destroy();this.bubbles=[];
      for(const event of visibleUtterances(frame,selected,3)){
        const actor=this.characters.get(event.participants[0]);if(!actor)continue;
        const speaker=frame.agents.find(a=>a.id===actor.id)?.name??'';
        const content=String(event.text).slice(0,68);
        const text=this.text(10,23,wrap(content)+(event.text.length>68?'…':''),11,'#405044',{lineSpacing:3});
        const width=Math.min(225,Math.max(128,text.width+20)),height=text.height+34;
        const graphics=this.add.graphics();graphics.fillStyle(0x3b513d,.10).fillRoundedRect(3,4,width,height,8);graphics.fillStyle(0xfffcf3,.98).fillRoundedRect(0,0,width,height,8);graphics.lineStyle(1,event.participants[0]===selected?0x689879:0xb9c7a8,1).strokeRoundedRect(0,0,width,height,8);
        graphics.fillStyle(0xfffcf3,1).fillTriangle(width/2-5,height-1,width/2+5,height-1,width/2,height+7);
        const title=this.text(10,7,`${speaker} · ${ACTION_NAMES[event.type]||'交談'}`,10,'#8c805e',{fontStyle:'bold'});
        const container=this.add.container(0,0,[graphics,title,text]).setDepth(1300+this.bubbles.length);
        this.bubbles.push({actor,container,width,height,event});
      }
      this.layoutBubbles();
    }
    layoutBubbles(){
      const placed=[];
      for(const bubble of this.bubbles){
        const {actor,container,width,height}=bubble;
        // Current-step speech stays readable until the next world frame. It appears
        // after a walking transition, and is never borrowed from a future trace.
        container.setVisible(!actor.moving);
        const idealX=actor.container.x-width/2,idealY=actor.container.y-height-67;
        const candidates=[];
        for(const dy of [0,-height-10,height+112])for(const dx of [0,-width-10,width+10]){
          const x=clip(idealX+dx,10,W-width-10),y=clip(idealY+dy,8,H-height-10);
          const overlaps=placed.reduce((sum,p)=>sum+(x<p.x+p.width+8&&x+width+8>p.x&&y<p.y+p.height+8&&y+height+8>p.y?1:0),0);
          candidates.push({x,y,score:overlaps*10000000+(x-idealX)**2+(y-idealY)**2});
        }
        const {x,y}=candidates.sort((a,b)=>a.score-b.score)[0];
        container.setPosition(x,y);placed.push({x,y,width,height});
      }
    }
    update(){if(this.bubbles.some(b=>b.actor.moving))this.layoutBubbles();}
  }
  try {
    game=new Phaser.Game({type:Phaser.AUTO,parent:host,width:W*dpr,height:H*dpr,backgroundColor:'#d4dfb5',banner:false,
      scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH,width:W*dpr,height:H*dpr,expandParent:false},
      render:{pixelArt:true,roundPixels:true},audio:{noAudio:true},fps:{target:60},scene:TownScene,
    });
    if(globalThis.ResizeObserver){observer=new ResizeObserver(resize);observer.observe(host);}
    globalThis.addEventListener('resize',resize);
  } catch(error){reportError(error);}
  return api;
}
