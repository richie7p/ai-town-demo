// Original, procedural artwork for the Phaser presentation. No remote images.
// All map coordinates and decoration are visual only, never research world state.
// Sprite frames: 0-3 idle D/L/R/U; 4-19 walk D/L/R/U (4 each);
// 20-23 work; 24-25 rest; 26-27 talk; 28-29 camera.
const W = 1000, H = 650;
const C = { grass: '#d4dfb5', grassLight: '#e0e8c6', grassDark: '#a8c192', path: '#f3e6c9', pathEdge: '#cfbd99', ink: '#3e5144', paper: '#fffaf0', wood: '#aa7951' };
const seed = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

function rect(c, x, y, w, h, color) { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h); }
function ellipse(c, x, y, rx, ry, color) { c.fillStyle = color; c.beginPath(); c.ellipse(x,y,rx,ry,0,0,Math.PI*2); c.fill(); }
function polygon(c, points, fill, stroke = null) { c.beginPath(); points.forEach(([x,y],i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath(); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle=stroke; c.lineWidth=2; c.stroke(); } }
function round(c,x,y,w,h,r,fill,stroke=null) { c.beginPath(); c.roundRect(x,y,w,h,r); c.fillStyle=fill; c.fill(); if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();} }
function text(c,s,x,y,size=13,color=C.ink,align='left',weight=500) { c.font=`${weight} ${size}px "Microsoft JhengHei", "Noto Sans TC", sans-serif`; c.fillStyle=color;c.textAlign=align;c.textBaseline='middle';c.fillText(s,x,y); }

function tree(c,x,y,s=1,tone=0) {
  c.save();c.translate(x,y);c.scale(s,s);
  rect(c,-4,-16,9,34,'#93724f');rect(c,2,-10,3,26,'#6f6148');
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
  // A photo composition board is scenery; actual equipment is rendered from events.
  rect(c,896,535,4,27,'#987d53');rect(c,882,516,31,24,'#f0e4c0');rect(c,886,520,23,16,'#b8c3a2');polygon(c,[[887,534],[895,525],[901,532],[906,526],[908,534]],'#8ca784');
  fence(c,675,610,237);flowers(c,639,610,6,'#d8a878');flowers(c,945,543,7,'#b1a4bd');
  // Edge trees frame the town while keeping all character slots clear.
  for(const [x,y,scale] of TREES){ ellipse(c,x+5,y+16,24*scale,8*scale,'#5f78442b'); }
  bush(c,318,65,49);bush(c,605,173,36);bush(c,334,613,46);bush(c,930,289,42);
  enrichLandscape(c);
  label(c,243,41,'住宅區','閱讀 · 休息 · 鄰里交談');label(c,770,41,'工坊','製作 · 修理 · 一起動手');
  label(c,245,388,'公共廣場','散步 · 相遇 · 自由交談');label(c,776,388,'活動區','攝影 · 觀察 · 共同活動');
  // North arrow and map identity deliberately remain quiet.
  text(c,'N',979,25,10,'#8c9a76','center',700);polygon(c,[[979,35],[975,44],[983,44]],'#8c9a76');
}

const TREES = [
  [24,78,1.05],[45,123,.9],[227,79,.78],[437,73,.92],
  [574,93,1.06],[952,106,1.15],[964,191,.85],[38,423,1.1],
  [45,541,.83],[405,421,.82],[438,619,.95],[545,621,.84],
  [945,613,1.1],[961,417,.94],[58,616,.78]
];
// These are decorative lamp heads, not research locations or resources.
const LAMPS = [{x:451,y:216},{x:548,y:450},{x:80,y:571},{x:928,y:265}];

function roofTiles(c, points, color, originY) {
  c.save(); c.beginPath(); points.forEach(([x,y],i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath(); c.clip();
  c.strokeStyle=color; c.lineWidth=1;
  const left=Math.min(...points.map(p=>p[0])),right=Math.max(...points.map(p=>p[0]));
  for(let row=0;row<5;row++) {
    const y=originY+row*10; c.beginPath(); c.moveTo(left,y); c.lineTo(right,y); c.stroke();
    for(let x=left+(row%2)*11;x<right;x+=22){c.beginPath();c.moveTo(x,y);c.lineTo(x-3,y+9);c.stroke();}
  }
  c.restore();
}
function pot(c,x,y,color='#d59f7b'){
  ellipse(c,x+1,y+8,10,3,'#68785020');polygon(c,[[x-7,y],[x+7,y],[x+5,y+8],[x-5,y+8]],color);rect(c,x-8,y-2,16,3,'#bd8765');
  rect(c,x-1,y-12,2,12,'#73915e');ellipse(c,x-4,y-10,4,2,'#97b377');ellipse(c,x+4,y-7,5,2,'#86a36e');
}
function enrichLandscape(c){
  // Staggered terracotta and slate tiles are clipped to each pitched roof.
  roofTiles(c,[[65,122],[94,74],[197,74],[225,122]],'#905f4e38',80);
  roofTiles(c,[[253,116],[282,68],[388,68],[416,116]],'#4f715b32',74);
  roofTiles(c,[[635,102],[669,55],[877,55],[913,102]],'#8f6d3e40',61);
  roofTiles(c,[[665,440],[694,392],[831,392],[859,440]],'#406a632b',398);
  // Bricks, little door plaques and stepping stones anchor houses to the gardens.
  for(const [x,y,w] of [[76,194,137],[264,194,140],[676,507,171]]){
    for(let i=0;i<w;i+=18){rect(c,x+i,y,1,5,'#b99b7260');}
    for(let row=0;row<3;row++) round(c,x+w/2-14+(row%2?3:0),y+15+row*10,27,7,3,'#e9ddbf');
  }
  for(const [x,y] of [[129,157],[319,151]]){rect(c,x-2,y-4,30,3,'#74856b');rect(c,x+31,y+6,10,5,'#d3b887');rect(c,x+34,y+7,4,2,'#987c55');}
  // Tiny curtains, books and reflections are visible through selected windows.
  for(const [x,y,w,h] of [[91,143,24,27],[164,143,24,27],[279,137,24,27],[355,137,24,27],[672,134,37,37],[691,461,24,27],[798,461,24,27]]){
    rect(c,x+2,y+2,4,h-4,'#f1dfbaaa');rect(c,x+w-6,y+2,4,h-4,'#f1dfbaaa');
    rect(c,x+5,y+h-7,3,6,'#a17b65');rect(c,x+9,y+h-9,3,8,'#859a7e');rect(c,x+w-9,y+5,3,4,'#e8f0dc85');
  }
  // Open workshop: plank floor, hanging tools and a lit interior workbench.
  rect(c,747,148,65,53,'#727a63');rect(c,750,151,60,21,'#a99e72');
  for(let row=0;row<3;row++)for(let col=0;col<9;col++)rect(c,753+col*6,155+row*5,1,1,'#6b7156');
  rect(c,754,157,2,11,'#dfceb0');rect(c,751,157,8,3,'#dfceb0');rect(c,766,157,2,12,'#746755');rect(c,763,157,8,4,'#b8c0ac');
  rect(c,780,158,2,11,'#d1af7a');rect(c,777,156,8,3,'#c8d1b9');rect(c,794,155,3,13,'#a18b61');
  rect(c,749,180,62,6,'#cfaa6f');rect(c,752,186,4,14,'#9b8053');rect(c,803,186,4,14,'#9b8053');rect(c,750,179,59,2,'#e6c58b');
  rect(c,755,175,20,4,'#ddc68f');rect(c,790,173,11,6,'#bb9163');
  for(let x=749;x<813;x+=10)rect(c,x,201,1,4,'#a28b61');
  // Work table grain and a planter beside the terrace.
  for(let i=0;i<4;i++)rect(c,857,218+i*2,52,1,'#9b714a45');
  rect(c,919,180,17,2,'#d5b67d');rect(c,919,197,17,2,'#7f6c4d');
  for(const [x,y] of [[65,194],[224,194],[419,185],[641,190],[866,505],[660,508]])pot(c,x,y);
  // Fountain masonry and quiet water reflections; the scene adds moving ripples.
  c.strokeStyle='#d3c9aa'; c.lineWidth=1;
  for(let i=0;i<12;i++){const a=i*Math.PI/6;c.beginPath();c.moveTo(240+66*Math.cos(a),495+29*Math.sin(a));c.lineTo(240+75*Math.cos(a),497+36*Math.sin(a));c.stroke();}
  for(const [x,y,w] of [[204,487,17],[266,500,14],[218,507,12],[257,481,9]])rect(c,x,y,w,2,'#e1f1de8c');
  // Picnic details and a noticeboard; decorative paper carries no simulation data.
  rect(c,874,446,11,13,'#f8f0d7');rect(c,890,447,12,11,'#e8d7b6');rect(c,906,447,9,12,'#f6e8c4');
  rect(c,876,449,6,1,'#b6a98b');rect(c,876,453,6,1,'#b6a98b');rect(c,892,450,7,1,'#b6a98b');
  for(const {x,y} of LAMPS){
    ellipse(c,x+2,y+47,9,3,'#68754a20');rect(c,x-2,y+5,4,42,'#737b60');rect(c,x-5,y+43,10,5,'#77765b');
    rect(c,x-5,y-6,10,13,'#6c765e');rect(c,x-3,y-4,6,8,'#f1dba1');rect(c,x-1,y-4,1,8,'#c2b67f');
    polygon(c,[[x-7,y-6],[x,y-12],[x+7,y-6]],'#6d785f');rect(c,x-1,y-13,2,3,'#6d785f');
  }
  // More individual grass blades and sparse flowers, kept off circulation routes.
  for(let i=0;i<65;i++){
    const x=seed(i+1900)*1000,y=seed(i+2400)*650;
    if((x>458&&x<539)||(y>300&&y<380)||y<63)continue;
    if((x>63&&x<440&&y<225)||(x>630&&x<932&&y<253)||(x>176&&x<320&&y>424&&y<537)||(x>658&&x<929&&y>389&&y<528))continue;
    rect(c,x,y,1,4,'#87a26b50');rect(c,x-2,y+1,1,2,'#87a26b50');rect(c,x+2,y,1,3,'#87a26b50');
  }
}

function shade(hex,offset){
  const value=/^#[0-9a-f]{6}$/i.test(hex)?hex:'#789b8e';
  return '#'+[1,3,5].map(i=>Math.max(0,Math.min(255,parseInt(value.slice(i,i+2),16)+offset)).toString(16).padStart(2,'0')).join('');
}
const HAIR=['#49392f','#6a4733','#353d42','#976648','#5b473c','#463b48','#ad8a57','#644a36'];
const SKIN=['#e5b88e','#dba27c','#edc7a1','#c9916e'];

function drawResident(c,agent,index,frame){
  let direction='down',motion='idle',phase=0;
  if(frame<4)direction=['down','left','right','up'][frame];
  else if(frame<20){direction=['down','left','right','up'][Math.floor((frame-4)/4)];motion='walk';phase=(frame-4)%4;}
  else if(frame<24){motion='work';phase=frame-20;}
  else if(frame<26){motion='rest';phase=frame-24;}
  else if(frame<28){motion='talk';phase=frame-26;}
  else {motion='camera';phase=frame-28;}
  const hair=HAIR[index%HAIR.length],skin=SKIN[index%SKIN.length],skinDark=shade(skin,-18),shirt=agent.color||'#769c8b';
  const edge=shade(shirt,-33),light=shade(shirt,23),pants=index%3===0?'#5e6d76':index%3===1?'#786955':'#57685e',shoe='#514b41';
  const walking=motion==='walk',step=walking?[0,3,0,-3][phase]:0,bob=walking&&phase%2===1?-1:0;
  const resting=motion==='rest',poseY=resting?7:bob;
  c.save();
  if(direction==='right'){c.translate(40,0);c.scale(-1,1);}
  c.translate(0,poseY);
  const side=direction==='left'||direction==='right',back=direction==='up';
  // Legs use separate stride positions and shoe soles, not a sliding static body.
  if(resting){
    rect(c,12,37,17,5,pants);rect(c,12,40,6,6,pants);rect(c,25,40,5,6,pants);
    rect(c,9,44,9,3,shoe);rect(c,25,44,9,3,shoe);rect(c,10,46,8,1,'#b6a989');rect(c,26,46,8,1,'#b6a989');
  }else if(side){
    rect(c,17+step,39,6,12,pants);rect(c,17-step,39,6,12,shade(pants,-12));
    rect(c,14+step,50,9,4,shoe);rect(c,14-step,50,9,4,shoe);rect(c,14+step,53,8,1,'#b8a98c');
  }else{
    rect(c,13,40,6,11+step/2,pants);rect(c,22,40,6,11-step/2,shade(pants,-8));
    rect(c,11,50+step/2,8,4,shoe);rect(c,22,50-step/2,8,4,shoe);
    rect(c,11,53+step/2,8,1,'#bdad8f');rect(c,22,53-step/2,8,1,'#bdad8f');
  }
  // Body, waist, shirt seams and a collar distinguish clothes from the skin.
  rect(c,side?15:12,26,side?12:17,15,edge);rect(c,side?15:13,26,side?10:14,13,shirt);
  rect(c,side?15:13,26,side?10:14,2,light);rect(c,side?16:13,39,side?10:14,2,shade(shirt,-18));
  if(!side&&!back){polygon(c,[[16,26],[20,29],[24,26]],'#eee1bf');rect(c,20,30,1,7,edge);rect(c,23,30,3,3,light);}
  if(back){rect(c,16,28,9,10,index%2?'#b59a70':shade(shirt,-16));rect(c,17,29,7,2,index%2?'#ceaf7e':shade(shirt,8));rect(c,14,27,2,11,'#6d6a53');rect(c,26,27,1,11,'#6d6a53');}
  // Arms. Work/talk/camera actions get their own silhouettes and visible props.
  const armOffset=walking?step:0;
  if(side){rect(c,18-armOffset,29,5,9,edge);rect(c,18-armOffset,36,4,5,skin);}
  else {
    rect(c,9,28+armOffset,4,8,shirt);rect(c,9,35+armOffset,4,5,skin);rect(c,28,28-armOffset,4,8,edge);rect(c,28,35-armOffset,4,5,skin);
  }
  // Neck and head; side noses and back hair make direction unambiguous.
  rect(c,17,22,7,6,skinDark);
  if(side){
    rect(c,13,10,15,15,hair);rect(c,12,15,13,10,skin);rect(c,10,19,4,3,skin);
    rect(c,14,12,11,5,hair);rect(c,24,16,4,8,hair);rect(c,22,19,3,4,skinDark);rect(c,14,18,2,2,'#3e3934');rect(c,12,23,4,1,'#b47960');
  }else{
    rect(c,12,9,16,17,hair);rect(c,10,15,3,8,hair);rect(c,28,15,2,8,hair);
    if(!back){
      rect(c,13,14,14,11,skin);rect(c,12,17,2,5,skinDark);rect(c,27,17,2,5,skinDark);
      rect(c,13,12,14,4,hair);rect(c,13,15,4,3,hair);rect(c,23,14,4,2,hair);
      rect(c,15,18,2,2,'#3c3a32');rect(c,23,18,2,2,'#3c3a32');rect(c,19,20,2,2,skinDark);rect(c,18,23,5,1,'#b3775c');
      rect(c,14,21,3,1,'#d79c7b');rect(c,24,21,2,1,'#d79c7b');
    }else{rect(c,13,13,13,9,hair);rect(c,14,10,9,2,shade(hair,24));rect(c,16,24,9,2,shade(hair,-13));}
  }
  // Eight silhouettes: cap, bob, glasses, bun, curls, scarf, beanie, ponytail.
  switch(index%8){
    case 0:
      rect(c,12,8,16,6,'#a5b28b');rect(c,14,6,12,3,'#bdc7a0');rect(c,side?8:12,13,side?19:20,2,'#778b6b');break;
    case 1:
      rect(c,side?25:10,17,4,10,hair);if(!side)rect(c,27,17,4,10,hair);rect(c,13,9,12,2,shade(hair,24));break;
    case 2:
      if(!back){rect(c,side?12:14,17,side?5:6,4,'#647577');rect(c,side?13:15,18,side?3:4,2,'#c4d3c1');if(!side){rect(c,22,17,5,4,'#647577');rect(c,23,18,3,2,'#c4d3c1');rect(c,20,18,2,1,'#647577');}}
      break;
    case 3:
      rect(c,side?25:15,5,8,6,hair);rect(c,side?25:17,4,5,2,shade(hair,25));rect(c,side?25:14,10,side?3:13,2,'#e1c39c');break;
    case 4:
      for(let i=0;i<4;i++)rect(c,11+i*4,8-(i%2)*2,5,6,hair);rect(c,14,8,3,2,shade(hair,23));break;
    case 5:
      rect(c,14,26,12,3,'#dfb77d');rect(c,24,28,3,9,'#c99866');rect(c,side?25:10,13,3,10,hair);break;
    case 6:
      rect(c,12,7,16,8,'#cda274');rect(c,14,5,12,3,'#d7b588');rect(c,10,13,20,3,'#b78862');rect(c,18,3,5,3,'#e0c69d');break;
    case 7:
      rect(c,side?27:25,16,5,13,hair);rect(c,side?27:25,18,5,2,'#b6bc83');rect(c,13,9,10,2,shade(hair,22));break;
  }
  if(motion==='work'){
    const lift=[0,5,8,3][phase];rect(c,26,29-lift,5,6,shirt);rect(c,29,31-lift,4,5,skin);
    rect(c,31,25-lift,2,12,'#a57b4f');rect(c,27,24-lift,10,4,'#788888');rect(c,28,24-lift,7,1,'#bac6bc');
    rect(c,11,35,9,4,skin);rect(c,15,35,10,3,'#ba915d');
  }else if(motion==='talk'){
    rect(c,28,29-phase*3,4,6,shirt);rect(c,30,29-phase*3,5,4,skin);rect(c,33,26-phase*3,2,5,skin);
    if(phase){rect(c,18,23,5,2,'#915e49');rect(c,19,23,3,1,'#f2dec4');}
  }else if(motion==='camera'){
    const lift=phase?0:4;rect(c,11,26+lift,6,4,skin);rect(c,26,26+lift,5,4,skin);
    rect(c,15,24+lift,13,8,'#465455');rect(c,17,22+lift,5,3,'#576566');rect(c,20,25+lift,6,6,'#a2b9af');rect(c,21,26+lift,4,4,'#334d50');rect(c,16,25+lift,2,2,'#d1cdaa');
  }else if(resting){
    rect(c,12,35,7,4,skin);rect(c,22,35,7,4,skin);rect(c,16,34,9,5,'#e5d7b0');rect(c,20,34,1,5,'#b7a780');
    if(phase&&!side){rect(c,15,18,3,1,hair);rect(c,23,18,3,1,hair);}
  }
  c.restore();
}

function makeCanvas(width,height){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;}

/** Register only presentation assets. The supplied agents and simulation are never mutated. */
export function registerTownAssets(scene,agents){
  const backgroundKey='town-landscape-phaser-v1';
  if(!scene.textures.exists(backgroundKey)){
    const canvas=makeCanvas(W,H);buildLandscape(canvas.getContext('2d'));scene.textures.addCanvas(backgroundKey,canvas);
  }
  const foreground=TREES.map(([x,y,scale],i)=>{
    const key=`town-tree-phaser-v1-${i}`;
    if(!scene.textures.exists(key)){const canvas=makeCanvas(80,100);tree(canvas.getContext('2d'),40,70,scale,i);scene.textures.addCanvas(key,canvas);}
    return {key,x:x-40,y:y-70,depth:y+18};
  });
  const characterKeys={};
  for(const [index,agent] of agents.entries()){
    const key=`town-resident-v1-${String(agent.id).replace(/[^a-z0-9_-]/gi,'_')}-${String(agent.color||'default').replace('#','')}-${index%8}`;
    if(!scene.textures.exists(key)){
      const sheet=makeCanvas(400,168),c=sheet.getContext('2d');c.imageSmoothingEnabled=false;
      for(let frame=0;frame<30;frame++){c.save();c.translate((frame%10)*40,Math.floor(frame/10)*56);c.beginPath();c.rect(0,0,40,56);c.clip();drawResident(c,agent,index,frame);c.restore();}
      // Phaser's TextureManager.addSpriteSheet accepts HTMLCanvasElement sources.
      scene.textures.addSpriteSheet(key,sheet,{frameWidth:40,frameHeight:56,endFrame:29});
    }
    characterKeys[agent.id]=key;
  }
  return {backgroundKey,foreground,ambient:{fountain:{x:240,y:495},lamps:LAMPS.map(p=>({...p}))},characterKeys};
}

