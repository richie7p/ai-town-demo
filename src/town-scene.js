import { ACTION_NAMES, ZONES } from './config.js';

// The map is a presentation of saved world frames. It never makes decisions or
// writes to the engine. Within-zone coordinates are illustrative, not research data.
const W = 1000, H = 650;
const C = { grass: '#d4dfb5', grassLight: '#e0e8c6', grassDark: '#a8c192', path: '#f3e6c9', pathEdge: '#cfbd99', ink: '#3e5144', paper: '#fffaf0', wood: '#aa7951' };
const points = {
  home: [[95,236],[172,250],[252,234],[335,253],[404,233],[124,283],[246,281],[369,285]],
  workshop: [[583,236],[659,249],[737,233],[816,253],[907,233],[602,283],[744,281],[879,284]],
  plaza: [[104,421],[198,410],[310,417],[397,454],[372,549],[282,580],[156,575],[91,514]],
  studio: [[585,421],[596,506],[687,528],[786,530],[906,507],[613,582],[748,584],[887,581]],
};
const doors = { home: [430,274], workshop: [570,274], plaza: [430,397], studio: [570,397] };
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const seed = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

function rect(c, x, y, w, h, color) { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h); }
function ellipse(c, x, y, rx, ry, color) { c.fillStyle = color; c.beginPath(); c.ellipse(x,y,rx,ry,0,0,Math.PI*2); c.fill(); }
function polygon(c, points, fill, stroke = null) { c.beginPath(); points.forEach(([x,y],i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath(); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle=stroke; c.lineWidth=2; c.stroke(); } }
function round(c,x,y,w,h,r,fill,stroke=null) { c.beginPath(); c.roundRect(x,y,w,h,r); c.fillStyle=fill; c.fill(); if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();} }
function text(c,s,x,y,size=13,color=C.ink,align='left',weight=500) { c.font=`${weight} ${size}px "Microsoft JhengHei", "Noto Sans TC", sans-serif`; c.fillStyle=color;c.textAlign=align;c.textBaseline='middle';c.fillText(s,x,y); }

function tree(c,x,y,s=1,tone=0) {
  c.save();c.translate(x,y);c.scale(s,s);
  ellipse(c,6,16,24,9,'#6c855d20');rect(c,-4,-16,9,34,'#93724f');rect(c,2,-10,3,26,'#6f6148');
  const dark=['#719263','#7c9a67','#8da86c'][tone%3],light=['#96b17b','#a4bb83','#b1c68a'][tone%3];
  polygon(c,[[-25,-17],[-25,-35],[-17,-35],[-17,-48],[-7,-48],[-7,-57],[9,-57],[9,-49],[20,-49],[20,-37],[28,-37],[28,-18],[19,-18],[19,-9],[-17,-9],[-17,-17]],dark);
  polygon(c,[[-23,-30],[-16,-44],[-6,-44],[-6,-53],[7,-53],[7,-44],[18,-44],[18,-30],[10,-24],[-16,-24]],light);
  rect(c,-15,-35,7,5,'#d2df9b68');rect(c,8,-20,9,4,'#58784b35');c.restore();
}
function bush(c,x,y,w=30) { ellipse(c,x+3,y+8,w*.65,7,'#6888531a');rect(c,x-w/2,y-5,w,17,'#8eae75');rect(c,x-w/2+5,y-11,w-10,9,'#a4be86');rect(c,x-w/2+4,y+6,w-8,6,'#799d67'); }
function flowers(c,x,y,n=5,color='#d69b8c') { for(let i=0;i<n;i++){const dx=(i%3)*9,dy=Math.floor(i/3)*10;rect(c,x+dx,y+dy,2,8,'#8b9f66');rect(c,x+dx-2,y+dy-3,6,5,color);rect(c,x+dx,y+dy-2,2,2,'#f5e7a9');} }
function windowBox(c,x,y,w=25,h=29){rect(c,x-3,y-3,w+6,h+6,'#e6d9b8');rect(c,x,y,w,h,'#a4bdb8');rect(c,x+4,y+4,w-8,3,'#d6e5d4');rect(c,x+w/2-1,y,3,h,'#fff2d7');rect(c,x,y+h/2-1,w,3,'#fff2d7');rect(c,x-5,y+h+5,w+10,8,'#b8855b');for(let i=0;i<4;i++)rect(c,x+i*7,y+h+1,5,7,i%2?'#b5c582':'#91aa6c');}
function house(c,x,y,w=145,h=86,roof='#c77c61',type=0) {
  ellipse(c,x+w/2+10,y+h+9,w*.56,12,'#5877511c');
  rect(c,x,y,w,h,'#f6eacc');rect(c,x+w-14,y,14,h,'#e3d3ac');rect(c,x,y+h-8,w,8,'#cab48b');
  polygon(c,[[x-11,y+8],[x+18,y-40],[x+w-16,y-40],[x+w+12,y+8]],roof);
  rect(c,x-13,y+7,w+27,7,'#8b614d');rect(c,x+24,y-40,w-44,4,'#e3ad8c');
  c.strokeStyle='#794e4224';c.lineWidth=2;for(let i=1;i<5;i++){c.beginPath();c.moveTo(x+i*w/5,y-34);c.lineTo(x+i*w/5-10,y+4);c.stroke();}
  rect(c,x+w-39,y-57,16,27,'#b58c70');rect(c,x+w-42,y-60,22,6,'#d2ae91');
  const doorX=x+w/2-12;rect(c,doorX,y+38,27,h-38,'#8c9d7b');rect(c,doorX+5,y+43,17,23,'#c7d2ad');rect(c,doorX+20,y+69,3,3,'#ece1b7');rect(c,doorX-5,y+h,37,6,'#d6c5a2');
  windowBox(c,x+15,y+29,24,27);if(w>130)windowBox(c,x+w-49,y+29,24,27);
  if(type){rect(c,x+9,y+h-6,10,11,'#b88d60');flowers(c,x+10,y+h-14,2,'#d7ad70');}
}
function bench(c,x,y,w=57){rect(c,x+5,y+10,5,18,'#777153');rect(c,x+w-10,y+10,5,18,'#777153');rect(c,x,y,w,7,'#b68b5d');rect(c,x,y+10,w,7,'#c39a6b');rect(c,x+4,y-11,4,21,'#8e7655');rect(c,x+w-8,y-11,4,21,'#8e7655');rect(c,x,y-12,w,9,'#bc9565');}
function fence(c,x,y,w){for(let i=0;i<=w;i+=18){rect(c,x+i,y,6,23,'#f6edd4');polygon(c,[[x+i,y],[x+i+3,y-4],[x+i+6,y]],'#f6edd4');}rect(c,x,y+6,w+6,5,'#f3e5c4');rect(c,x,y+16,w+6,4,'#dfcfaa');}
function label(c,x,y,name,sub){round(c,x-71,y-18,142,41,7,'#fffaf0ec','#bac89b');text(c,name,x,y-4,14,C.ink,'center',700);text(c,sub,x,y+13,10,'#7a876c','center');}

function buildLandscape(c){
  rect(c,0,0,W,H,C.grass);
  // Gentle, deterministic grass texture; the landscape contains no external assets.
  for(let i=0;i<470;i++){const x=seed(i+2)*W,y=seed(i+800)*H;rect(c,x,y,2+seed(i+1200)*4,2,i%4?'#abc28c38':'#edf0cb60');}
  round(c,24,30,427,270,30,'#dce4bb');round(c,551,30,425,270,30,'#dbe2b3');
  round(c,25,373,426,254,34,'#cdddb1');round(c,552,373,422,254,34,'#dbe4bb');
  rect(c,467,0,66,H,C.pathEdge);rect(c,0,310,W,63,C.pathEdge);rect(c,470,0,60,H,C.path);rect(c,0,313,W,57,C.path);
  // Walkways link courtyards to the main crossing.
  for(const [x,y,w,h] of [[80,266,398,24],[522,266,400,24],[415,360,25,210],[524,390,82,25],[585,395,25,202],[602,564,315,23]]){round(c,x,y,w,h,8,C.path);}
  for(let i=0;i<25;i++){rect(c,i*42+8,316,19,2,'#c9b69535');rect(c,i*42+22,363,17,2,'#c9b69535');}
  for(let i=0;i<19;i++){rect(c,474,i*35+11,2,13,'#c9b69540');rect(c,525,i*35+26,2,12,'#c9b69540');}
  // Central tiled meeting point.
  round(c,462,304,76,76,12,'#ded6b6');for(let ix=0;ix<3;ix++)for(let iy=0;iy<3;iy++)rect(c,470+ix*21,313+iy*19,18,16,(ix+iy)%2?'#eee5cb':'#e7ddbf');
  house(c,76,114,137,86,'#c78064',1);house(c,264,108,140,92,'#819776',1);
  fence(c,83,213,118);fence(c,277,213,111);flowers(c,47,210,6);flowers(c,423,205,5,'#e0c783');
  bench(c,331,267,49);bush(c,52,161,27);bush(c,431,128,35);
  // The workshop has an open double door and visible work benches.
  const x=653,y=94;ellipse(c,777,208,132,13,'#5c765720');rect(c,x,y,243,111,'#eddbac');rect(c,x+228,y,15,111,'#d3bd8c');
  polygon(c,[[x-18,y+8],[x+16,y-39],[x+224,y-39],[x+260,y+8]],'#b88e53');rect(c,x-19,y+8,280,8,'#856d47');rect(c,x+22,y-39,191,5,'#d3b376');
  for(let k=0;k<6;k++)rect(c,x+28+k*33,y-29,22,3,'#caac733a');windowBox(c,x+19,y+40,37,37);
  rect(c,x+86,y+39,83,72,'#a49c74');rect(c,x+92,y+44,71,67,'#73765d');rect(c,x+88,y+108,83,7,'#ccb284');rect(c,x+196,y+38,24,38,'#a6b8a0');
  round(c,x+73,y+12,116,25,3,'#f7e8c5');text(c,'小鎮工坊',x+131,y+25,13,'#766544','center',700);
  rect(c,854,216,59,12,'#b88754');rect(c,860,228,5,20,'#8a6b46');rect(c,900,228,5,20,'#8a6b46');rect(c,864,210,22,5,'#dfce9b');
  rect(c,877,205,4,11,'#7e8a7c');rect(c,871,203,15,4,'#6f7e73');rect(c,916,175,23,30,'#b59461');rect(c,917,185,21,3,'#96784d');
  // Fountain, benches, flowers and a little reading garden.
  ellipse(c,240,503,87,45,'#b8ca9f');ellipse(c,240,497,76,37,'#ece7ce');ellipse(c,240,495,65,29,'#9dc9c3');ellipse(c,240,493,54,22,'#b7dcd2');
  rect(c,235,456,10,38,'#dcdcc5');ellipse(c,240,454,28,11,'#f2ecd4');ellipse(c,240,451,22,7,'#a6d2c8');rect(c,237,430,6,21,'#e7e5ce');ellipse(c,240,429,7,6,'#f4efd8');
  c.strokeStyle='#e4f6df';c.lineWidth=2;c.beginPath();c.moveTo(223,454);c.quadraticCurveTo(211,469,216,488);c.moveTo(257,454);c.quadraticCurveTo(267,468,263,488);c.stroke();
  bench(c,103,466,54);bench(c,321,468,54);bench(c,213,586,54);flowers(c,59,580,7,'#c791aa');flowers(c,388,591,6,'#e2bc73');
  // Photography club and its lawn. Equipment is overlaid from frame data below.
  house(c,676,432,171,81,'#769b91');rect(c,663,433,196,9,'#5c8179');round(c,706,446,111,24,3,'#faf1d7');text(c,'光影小屋',762,458,13,'#526f65','center',700);
  rect(c,870,440,52,28,'#e6d8b1');rect(c,873,444,46,17,'#b4caa3');rect(c,878,468,4,29,'#9a8460');rect(c,912,468,4,29,'#9a8460');
  // Camera tripod is a decorative landmark; resource counts are authoritative.
  rect(c,899,534,4,32,'#637468');polygon(c,[[900,542],[881,567],[886,567],[901,548],[918,567],[923,567]],'#637468');rect(c,887,522,30,19,'#536e62');rect(c,892,517,11,6,'#677f6d');ellipse(c,906,532,7,7,'#a5c3ad');ellipse(c,906,532,4,4,'#5c847e');
  fence(c,675,610,237);flowers(c,639,610,6,'#d8a878');flowers(c,945,543,7,'#b1a4bd');
  // Edge trees frame the town while keeping all character slots clear.
  [[24,78,1.05],[45,123,.9],[227,79,.78],[437,73,.92],[574,93,1.06],[952,106,1.15],[964,191,.85],[38,423,1.1],[45,541,.83],[405,421,.82],[438,619,.95],[545,621,.84],[945,613,1.1],[961,417,.94],[58,616,.78]].forEach(([a,b,s],i)=>tree(c,a,b,s,i));
  bush(c,318,65,49);bush(c,605,173,36);bush(c,334,613,46);bush(c,930,289,42);
  label(c,243,41,'住宅區','閱讀 · 休息 · 鄰里交談');label(c,770,41,'工坊','製作 · 修理 · 一起動手');
  label(c,245,388,'公共廣場','散步 · 相遇 · 自由交談');label(c,776,388,'活動區','攝影 · 觀察 · 共同活動');
  // North arrow and map identity deliberately remain quiet.
  text(c,'N',979,25,10,'#8c9a76','center',700);polygon(c,[[979,35],[975,44],[983,44]],'#8c9a76');
}

function positionFor(agent,frame){
  const index=Math.max(0,frame.agents.findIndex(a=>a.id===agent.id));
  const base=points[agent.zone]?.[index%8]??[500,340];
  const p=frame.trace?.proposals.find(p=>p.actor===agent.id);
  const movingWithin=p?.action==='walk'&&frame.events.some(e=>e.tick===frame.tick&&e.proposalId===p.id&&e.success);
  return [base[0]+(movingWithin?(frame.tick%2?12:-12):0),base[1]+(movingWithin?(index%2?5:-5):0)];
}
function routeBetween(from,to,oldZone,newZone){
  if(oldZone===newZone)return [from,to];
  const a=doors[oldZone]??[500,340],b=doors[newZone]??[500,340];
  const exit=(p,zone)=>{
    if(zone==='home'||zone==='workshop')return [p,[p[0],274],doors[zone]];
    if(zone==='plaza'){const lane=p[0]<190?85:422;return [p,[lane,p[1]],[lane,397],doors[zone]];}
    if(zone==='studio')return [p,[p[0],571],[600,571],[600,397],doors[zone]];
    return [p,[500,340]];
  };
  return [...exit(from,oldZone),[500,a[1]],[500,b[1]],...exit(to,newZone).reverse()];
}
function pointOnPath(path,t){
  const lengths=path.slice(1).map((p,i)=>Math.hypot(p[0]-path[i][0],p[1]-path[i][1]));
  let d=lengths.reduce((a,b)=>a+b,0)*t;
  for(let i=0;i<lengths.length;i++){if(d<=lengths[i]){const f=lengths[i]?d/lengths[i]:1;return [path[i][0]+(path[i+1][0]-path[i][0])*f,path[i][1]+(path[i+1][1]-path[i][1])*f];}d-=lengths[i];}
  return path.at(-1);
}

function drawPerson(c,a,pos,index,{selected,moving,time,held,action,failed}){
  const [x,y]=pos,bob=moving?Math.sin(time*.018+index)*1.8:0;
  ellipse(c,x,y+3,13,5,'#4e6f4525');
  if(selected){c.strokeStyle='#4e7c64';c.lineWidth=2;c.setLineDash([3,3]);c.beginPath();c.ellipse(x,y+3,20,8,0,0,Math.PI*2);c.stroke();c.setLineDash([]);}
  c.save();c.translate(Math.round(x),Math.round(y+bob));
  const skin=['#e9bc90','#d9a578','#efc8a1','#c99873'][index%4],hair=['#66523f','#8a6549','#484e45','#775b43'][index%4];
  const stride=moving?Math.sin(time*.022+index)*3:0;
  rect(c,-7,-12,5,12+stride,'#52655c');rect(c,2,-12,5,12-stride,'#52655c');rect(c,-9,-2+stride,8,4,'#47554b');rect(c,1,-2-stride,9,4,'#47554b');
  rect(c,-9,-27,18,17,a.color);rect(c,-12,-25,4,14+stride,skin);rect(c,9,-25,4,14-stride,skin);rect(c,-5,-27,10,3,'#ffffff38');
  rect(c,-8,-43,16,17,skin);rect(c,-10,-42,20,7,hair);rect(c,-11,-37,5,8,hair);rect(c,7,-37,4,6,hair);rect(c,-7,-45,14,4,hair);
  if(index%3===1){rect(c,-12,-43,24,5,'#e6c481');rect(c,-8,-49,16,7,'#d1ad68');}
  if(index%3===2){rect(c,-11,-37,4,15,hair);rect(c,7,-37,5,16,hair);}
  rect(c,-4,-34,2,2,'#4c5143');rect(c,3,-34,2,2,'#4c5143');rect(c,-1,-29,3,1,'#af7b67');
  if(index===6){c.strokeStyle='#657260';c.lineWidth=1;c.strokeRect(-6,-36,5,4);c.strokeRect(2,-36,5,4);}
  if(held?.type==='camera'){rect(c,4,-22,12,8,'#4b6860');ellipse(c,11,-18,3,3,'#a5c2b4');}
  if(held?.type==='tools'){rect(c,9,-19,3,13,'#b38a52');rect(c,6,-22,10,5,'#697c72');}
  c.restore();
  const nameWidth=Math.max(40,a.name.length*12+14);
  round(c,x-nameWidth/2,y+10,nameWidth,20,5,selected?'#365c49':'#fffaf0ee',selected?null:'#e3ddc5');text(c,a.name,x,y+20,11,selected?'#fffaf0':C.ink,'center',700);
  if(selected&&action){const label=failed?'行動未成立':ACTION_NAMES[action]??action;round(c,x-34,y+33,68,17,4,failed?'#f3d6bf':'#edf0db');text(c,label,x,y+42,9,failed?'#925e41':'#637954','center');}
}

function bubble(c,event,pos,name,occupied){
  const chars=Array.from(event.text||'');const line1=chars.slice(0,17).join('');const line2=chars.slice(17,34).join('')+(chars.length>34?'…':'');
  const w=clamp(Math.max(Array.from(line1).length,Array.from(line2).length)*11+28,112,230),h=line2?65:48;
  const x=clamp(pos[0]-w/2,9,W-w-9),y=clamp(pos[1]-h-63,12,H-h-12);
  // Prefer fewer readable bubbles to a pile of overlapping messages.
  if(occupied.some(b=>x<b.x+b.w+8&&x+w+8>b.x&&y<b.y+b.h+8&&y+h+8>b.y))return;
  occupied.push({x,y,w,h});
  c.save();c.shadowColor='#5264471d';c.shadowBlur=10;c.shadowOffsetY=3;round(c,x,y,w,h,9,'#fffdf5');c.restore();
  const tipX=clamp(pos[0],x+15,x+w-15);polygon(c,[[tipX-6,y+h-1],[tipX+6,y+h-1],[tipX,y+h+7]],'#fffdf5');
  text(c,`${name} · ${event.type==='invite'?'邀請':event.type==='reply'?'回覆':'說'}`,x+12,y+13,9,'#8e997e');text(c,line1,x+12,y+31,11,C.ink);if(line2)text(c,line2,x+12,y+47,11,C.ink);
}

function equipmentBadge(c,frame,zone,x,y){
  const items=frame.equipment.filter(e=>e.zone===zone),used=items.filter(e=>e.owner).length;
  const type=zone==='workshop'?'製作工具':'攝影設備';
  round(c,x,y,143,25,5,'#fffaf0ec','#d1d4b7');text(c,type,x+9,y+13,10,'#6c795f');
  text(c,`${used} / ${items.length} 使用中`,x+134,y+13,10,used===items.length?'#9d7048':'#557563','right',700);
  for(let i=0;i<items.length;i++)rect(c,x+9+i*15,y+29,11,5,items[i].owner?'#b88c55':'#a8c3a0');
}

/**
 * Canvas map. render(frame, options) accepts viewFrame output. Use animate:false
 * for seeking/importing; repeated calls for the same tick only change selection.
 * duration controls presentation milliseconds, never simulated time.
 */
export function createTownScene(canvas,{onSelect=()=>{}}={}){
  const c=canvas.getContext('2d');
  if(!c)throw new Error('瀏覽器不支援 Canvas 2D');
  const backdrop=document.createElement('canvas');let dpr=0;
  let frame=null,options={},prior=null,paths=new Map(),positions=new Map(),start=0,duration=900,raf=0,dead=false;
  canvas.setAttribute('role','img');canvas.setAttribute('aria-label','AI 小鎮地圖：住宅區、工坊、公共廣場與活動區；點選人物查看事件與記憶。');
  function resize(){
    const next=Math.min(window.devicePixelRatio||1,2);if(next===dpr&&canvas.width===W*dpr)return;
    dpr=next;canvas.width=W*dpr;canvas.height=H*dpr;backdrop.width=W*dpr;backdrop.height=H*dpr;
    const bc=backdrop.getContext('2d');bc.setTransform(dpr,0,0,dpr,0,0);buildLandscape(bc);paint(performance.now());
  }
  function draw(now){
    if(dead||!frame)return false;
    c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,H);c.drawImage(backdrop,0,0,W,H);
    // Ambient color is visual only; it does not represent an extra world state.
    const slot=(Math.max(1,frame.tick)-1)%12; if(slot>8){rect(c,0,0,W,H,slot>10?'#6c789615':'#b7897910');}
    const ratio=options.reducedMotion?1:clamp((now-start)/duration,0,1),eased=ratio*ratio*(3-2*ratio);
    const current=frame.events.filter(e=>e.tick===frame.tick),proposals=frame.trace?.proposals??[];
    const ordered=frame.agents.map((a,i)=>{
      const path=paths.get(a.id)??[positionFor(a,frame)],p=pointOnPath(path,eased);positions.set(a.id,p);
      return {a,i,p,moving:ratio<1&&Math.hypot(path[0][0]-path.at(-1)[0],path[0][1]-path.at(-1)[1])>1};
    }).sort((a,b)=>a.p[1]-b.p[1]);
    for(const {a,i,p,moving} of ordered){const proposal=proposals.find(v=>v.actor===a.id);drawPerson(c,a,p,i,{selected:a.id===options.selected,moving,time:now,held:frame.equipment.find(e=>e.owner===a.id),action:proposal?.action,failed:current.some(e=>e.proposalId===proposal?.id&&e.success===false)});}
    equipmentBadge(c,frame,'workshop',618,294);equipmentBadge(c,frame,'studio',650,613);
    // Only actual successful utterance events can become speech bubbles.
    const utterances=current.filter(e=>['talk','reply','invite','accept','decline'].includes(e.type)&&e.success&&e.text);
    const speakerSeen=new Set();const visible=[...utterances].sort((a,b)=>(b.participants[0]===options.selected)-(a.participants[0]===options.selected)).filter(e=>{if(speakerSeen.has(e.participants[0]))return false;speakerSeen.add(e.participants[0]);return true;}).slice(0,3);
    // Avoid covering walkers mid-route. Bubbles belong to the settled current frame.
    if(ratio>=.94||options.reducedMotion){const occupied=[];for(const e of visible){const actor=frame.agents.find(a=>a.id===e.participants[0]);if(actor)bubble(c,e,positions.get(actor.id),actor.name,occupied);}}
    return ratio<1;
  }
  function paint(now){raf=0;if(draw(now))raf=requestAnimationFrame(paint);}
  function schedule(){if(!raf&&!dead)raf=requestAnimationFrame(paint);}
  function localPoint(event){
    const box=canvas.getBoundingClientRect(),scale=Math.min(box.width/W,box.height/H);
    return [(event.clientX-box.left-(box.width-W*scale)/2)/scale,(event.clientY-box.top-(box.height-H*scale)/2)/scale];
  }
  function click(event){
    if(!frame)return;const [x,y]=localPoint(event);
    const hit=[...positions.entries()].map(([id,p])=>({id,d:Math.hypot(x-p[0],(y-(p[1]-15))*.8)})).filter(a=>a.d<34).sort((a,b)=>a.d-b.d)[0];if(hit)onSelect(hit.id);
  }
  function hover(event){const [x,y]=localPoint(event);canvas.style.cursor=[...positions.values()].some(p=>Math.hypot(x-p[0],(y-p[1]+15)*.8)<34)?'pointer':'default';}
  canvas.addEventListener('click',click);canvas.addEventListener('pointermove',hover);
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>resize()):null;observer?.observe(canvas);resize();
  return {
    render(nextFrame,nextOptions={}){
      if(dead)return;
      const changed=!frame||nextFrame.tick!==frame.tick||nextFrame.config.seed!==frame.config.seed||nextFrame.config.capacity!==frame.config.capacity;
      options={...options,...nextOptions};
      if(changed){
        prior=frame;frame=nextFrame;const animate=options.animate!==false&&!options.reducedMotion&&prior&&frame.tick===prior.tick+1&&frame.config.seed===prior.config.seed&&frame.config.capacity===prior.config.capacity;
        paths=new Map(frame.agents.map(a=>{const end=positionFor(a,frame),old=prior?.agents.find(v=>v.id===a.id),from=positions.get(a.id)??end;return [a.id,animate&&old?routeBetween(from,end,old.zone,a.zone):[end,end]];}));
        start=animate?performance.now():0;duration=clamp(Number(options.duration)||900,180,2200);
      }else frame=nextFrame;
      schedule();
    },
    destroy(){dead=true;cancelAnimationFrame(raf);observer?.disconnect();canvas.removeEventListener('click',click);canvas.removeEventListener('pointermove',hover);positions.clear();paths.clear();},
  };
}
