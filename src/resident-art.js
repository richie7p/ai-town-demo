// Original pixel characters for the town; no third-party character art.
// Every 64 × 96 frame uses one 32 × 48 logical grid and a shared foot anchor.
// Frames are drawn together so identity, palette and scale cannot drift between poses.
import { RESIDENT_FRAME_COUNT } from './resident-motion.js';
export const RESIDENT_FRAME = Object.freeze({ width:64, height:96 });

const PEOPLE = {
  '小禾': { id:'he', skin:'#e6b58d', hair:'#3c322c', pants:'#526964', shoes:'#483e35', accent:'#d6bb79', garment:'overalls', hairStyle:'short', accessory:'leaf' },
  '阿光': { id:'guang', skin:'#c89068', hair:'#362b29', pants:'#4e626d', shoes:'#503b30', accent:'#e8cf96', garment:'field', hairStyle:'wavy', accessory:'strap' },
  '木木': { id:'mu', skin:'#e7b78e', hair:'#51413b', pants:'#3f495b', shoes:'#3c3735', accent:'#a7b9cc', garment:'jacket', hairStyle:'parted', accessory:'glasses' },
  '小苒': { id:'ran', skin:'#f0c19b', hair:'#6d4539', pants:'#5b4b55', shoes:'#5b3d3a', accent:'#f0cfb5', garment:'cardigan', hairStyle:'bun', accessory:'ribbon' },
  '日青': { id:'qing', skin:'#e4b28c', hair:'#34454a', pants:'#465b67', shoes:'#3b4950', accent:'#e7ce96', garment:'coat', hairStyle:'bob', accessory:'satchel' },
  '阿岚': { id:'lan', skin:'#c99a75', hair:'#3d3930', pants:'#5c6050', shoes:'#464238', accent:'#d6b783', garment:'vest', hairStyle:'cap', accessory:'scarf' },
  '知序': { id:'xu', skin:'#eac09b', hair:'#49332d', pants:'#4a4655', shoes:'#4a3835', accent:'#d0b7ce', garment:'shirt', hairStyle:'ponytail', accessory:'roundglasses' },
  '小麥': { id:'mai', skin:'#dbac82', hair:'#774d2e', pants:'#596c63', shoes:'#4c3930', accent:'#e5ca8e', garment:'knit', hairStyle:'curls', accessory:'bookbag' },
};
const FALLBACK = PEOPLE['小禾'];
const portraitCache = new Map();
const INK='#263d43';
const clamp=n=>Math.max(0,Math.min(255,n));
const shade=(hex,n)=>'#'+hex.slice(1).match(/../g).map(v=>clamp(parseInt(v,16)+n).toString(16).padStart(2,'0')).join('');
const rect=(c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
// Scan-line polygons and pixel lines keep diagonal contours crisp too. Canvas
// imageSmoothingEnabled alone does not turn antialiasing off for filled paths.
function polygon(c,points,color){
  const min=Math.floor(Math.min(...points.map(p=>p[1]))),max=Math.ceil(Math.max(...points.map(p=>p[1])));
  for(let y=min;y<max;y++){
    const hits=[];
    for(let i=0,j=points.length-1;i<points.length;j=i++){
      const [x1,y1]=points[j],[x2,y2]=points[i],scan=y+.5;
      if((y1<=scan&&y2>scan)||(y2<=scan&&y1>scan))hits.push(x1+(scan-y1)*(x2-x1)/(y2-y1));
    }
    hits.sort((a,b)=>a-b);
    for(let i=0;i<hits.length;i+=2){const x=Math.ceil(hits[i]-.5),end=Math.ceil(hits[i+1]-.5);if(end>x)rect(c,x,y,end-x,1,color);}
  }
}
function line(c,a,b,color,width=1){
  let x=Math.round(a[0]),y=Math.round(a[1]);const ex=Math.round(b[0]),ey=Math.round(b[1]),dx=Math.abs(ex-x),dy=-Math.abs(ey-y),sx=x<ex?1:-1,sy=y<ey?1:-1;let error=dx+dy;
  for(;;){rect(c,x,y,width,width,color);if(x===ex&&y===ey)break;const e=2*error;if(e>=dy){error+=dy;x+=sx;}if(e<=dx){error+=dx;y+=sy;}}
}
// A resident's colours are fixed for a town, while the atlas asks for them once per frame.
const paletteCache=new Map();
function palette(agent){
  const key=`${agent.name}|${agent.color}`;let colors=paletteCache.get(key);
  if(!colors){
    const p=PEOPLE[agent.name]??FALLBACK,main=/^#[a-f0-9]{6}$/i.test(agent.color)?agent.color:'#367760';
    colors=Object.freeze({...p,main,light:shade(main,26),deep:shade(main,-27),skinLight:shade(p.skin,20),skinShadow:shade(p.skin,-23),hairLight:shade(p.hair,29),hairDark:shade(p.hair,-14)});
    if(paletteCache.size<64)paletteCache.set(key,colors);
  }
  return colors;
}
function identity(agent){const p=palette(agent);return `resident-detail-v4-${p.id}-${p.main.slice(1).toLowerCase()}`;}
function poseFor(frame){
  const directions=['down','left','right','up'];
  if(frame>=176)return {direction:directions[Math.floor((frame-176)/4)],motion:'idle',phase:(frame-176)%4,smooth:true};
  if(frame>=160)return {direction:frame<168?'down':'up',motion:'camera',phase:(frame-160)%8,smooth:true};
  if(frame>=144)return {direction:frame<152?'down':'up',motion:'work',phase:(frame-144)%8,smooth:true};
  if(frame>=112)return {direction:directions[Math.floor((frame-112)/8)],motion:'talk',phase:(frame-112)%8,smooth:true};
  if(frame>=96)return {direction:directions[Math.floor((frame-96)/4)],motion:'rest',phase:(frame-96)%4,smooth:true,seated:1};
  if(frame>=80)return {direction:directions[Math.floor((frame-80)/4)],motion:'sit',phase:(frame-80)%4,smooth:true,seated:[0,.25,.7,1][(frame-80)%4]};
  if(frame>=48)return {direction:directions[Math.floor((frame-48)/8)],motion:'walk',phase:(frame-48)%8,smooth:true};
  if(frame>=46)return {direction:'up',motion:'talk',phase:frame-46};
  if(frame>=44)return {direction:'right',motion:'talk',phase:frame-44};
  if(frame>=42)return {direction:'left',motion:'talk',phase:frame-42};
  if(frame>=40)return {direction:'up',motion:'camera',phase:frame-40};
  if(frame>=38)return {direction:'right',motion:'rest',phase:frame-38};
  if(frame>=36)return {direction:'left',motion:'rest',phase:frame-36};
  if(frame>=34)return {direction:'up',motion:'rest',phase:frame-34};
  if(frame>=30)return {direction:'up',motion:'work',phase:frame-30};
  if(frame<4)return {direction:['down','left','right','up'][frame],motion:'idle',phase:0};
  if(frame<20)return {direction:['down','left','right','up'][Math.floor((frame-4)/4)],motion:'walk',phase:(frame-4)%4};
  if(frame<24)return {direction:'down',motion:'work',phase:frame-20};
  if(frame<26)return {direction:'down',motion:'rest',phase:frame-24};
  if(frame<28)return {direction:'down',motion:'talk',phase:frame-26};
  return {direction:'down',motion:'camera',phase:frame-28};
}
function boot(c,x,y,p,side=false){
  rect(c,x+1,y,5,2,p.shoes);rect(c,x,y+2,side?8:7,3,p.shoes);rect(c,x,y+4,side?8:7,1,'#c5b99e');
  rect(c,x+1,y+1,3,1,shade(p.shoes,30));if(!side)rect(c,x+2,y+2,3,1,'#a59880');
}
function legs(c,p,pose,side,back){
  if(pose.smooth){naturalLegs(c,p,pose,side,back);return;}
  const stride=pose.motion==='walk'?[0,2,0,-2][pose.phase]:0;
  if(pose.motion==='rest'){
    if(side){rect(c,12,34,9,5,p.pants);rect(c,7,37,9,4,p.pants);rect(c,7,39,4,4,p.deep);rect(c,14,39,4,4,p.pants);boot(c,5,42,p,true);boot(c,12,42,p,true);}
    else {rect(c,9,34,14,5,p.pants);rect(c,9,38,5,6,p.pants);rect(c,18,38,5,6,shade(p.pants,-12));rect(c,10,39,2,3,shade(p.pants,21));boot(c,8,42,p);boot(c,18,42,p);}
    return;
  }
  if(side){
    const far=15-stride,near=14+stride;
    polygon(c,[[13,33],[19,33],[far+5,39],[far+4,45],[far-1,45],[far-1,40]],shade(p.pants,-16));boot(c,far-3,42,p,true);
    polygon(c,[[12,33],[18,33],[near+5,39],[near+3,45],[near-2,45],[near-3,40]],p.pants);rect(c,near,36,2,6,shade(p.pants,20));boot(c,near-4,42,p,true);
  }else{
    for(const [x,step,shift] of [[10,stride,6],[18,-stride,-8]]){
      const footY=42+Math.min(0,step);
      rect(c,x,33,5,footY-31,p.pants);rect(c,x+1,35,2,footY-35,shade(p.pants,shift+16));rect(c,x,footY-1,5,2,shade(p.pants,-18));boot(c,x-1,footY,p);
      if(back)rect(c,x,footY+2,4,1,shade(p.shoes,-12));
    }
    rect(c,14,33,4,3,shade(p.pants,-18));
  }
}
function naturalLegs(c,p,pose,side,back){
  const seated=pose.motion==='rest'?1:pose.motion==='sit'?pose.seated:0;
  if(seated){
    const hip=33+Math.round(seated*5),knee=38+Math.round(seated*2);
    if(side){
      const front=13-Math.round(seated*6);
      polygon(c,[[12,hip],[21,hip],[21,knee],[front+4,knee+1],[front+4,45],[front,45],[front,knee-3],[14,knee-3]],p.pants);
      polygon(c,[[17,hip],[22,hip],[22,knee],[front+10,knee+2],[front+9,45],[front+5,45],[front+5,knee-1],[17,knee-1]],shade(p.pants,-16));
      rect(c,front+1,knee,2,4,shade(p.pants,21));boot(c,front-2,42,p,true);boot(c,front+6,42,p,true);
    }else{
      polygon(c,[[9,hip],[23,hip],[23,knee],[20,knee+2],[12,knee+2],[9,knee]],p.pants);
      rect(c,9,knee,5,46-knee,p.pants);rect(c,18,knee,5,46-knee,shade(p.pants,-14));
      rect(c,10,knee+1,2,Math.max(1,44-knee),shade(p.pants,20));boot(c,8,42,p);boot(c,18,42,p);
    }
    return;
  }
  if(pose.motion!=='walk'){
    // Stable planted feet while idle, talking, working and taking pictures.
    legs(c,p,{...pose,smooth:false,motion:'idle',phase:0},side,back);return;
  }
  const stride=[-2,-1,0,1,2,1,0,-1][pose.phase];
  const nearLift=[0,0,0,0,0,1,2,1][pose.phase],farLift=[0,1,2,1,0,0,0,0][pose.phase];
  if(side){
    const far=15-stride,near=14+stride;
    polygon(c,[[13,33],[19,33],[far+5,38],[far+4,45-farLift],[far-1,45-farLift],[far-1,39]],shade(p.pants,-16));boot(c,far-3,42-farLift,p,true);
    polygon(c,[[12,33],[18,33],[near+5,38],[near+3,45-nearLift],[near-2,45-nearLift],[near-3,39]],p.pants);
    rect(c,near,36,2,Math.max(2,6-nearLift),shade(p.pants,20));boot(c,near-4,42-nearLift,p,true);
  }else{
    for(const [x,lift,knee]of [[10,nearLift,stride],[18,farLift,-stride]]){
      const shift=Math.abs(knee)===2?Math.sign(knee):0,y=42-lift;
      polygon(c,[[x,33],[x+5,33],[x+5+shift,38],[x+5,y+2],[x,y+2],[x+shift,38]],p.pants);
      rect(c,x+1+shift,35,2,Math.max(2,y-35),shade(p.pants,x===10?21:6));boot(c,x-1,y,p);
      if(back)rect(c,x,y+2,4,1,shade(p.shoes,-12));
    }
    rect(c,14,33,4,3,shade(p.pants,-18));
  }
}
function hairBack(c,p,side){
  if(['bob','ponytail','bun'].includes(p.hairStyle)){
    polygon(c,side?[[11,8],[24,8],[26,15],[25,23],[22,26],[13,24]]:[[7,8],[25,8],[27,15],[25,25],[22,27],[9,25],[5,18]],p.hairDark);
  }
  if(p.hairStyle==='ponytail'){
    const x=side?25:24;polygon(c,[[x,12],[x+3,12],[x+5,16],[x+3,25],[x+1,29],[x-1,24],[x,18]],p.hair);rect(c,x+1,17,1,7,p.hairLight);rect(c,x-1,14,4,2,p.accent);
  }
}
function torso(c,p,side,back){
  const x=side?11:9,w=side?11:14;
  polygon(c,[[x+2,22],[x+w-2,22],[x+w+1,26],[x+w,35],[x,35],[x-1,26]],p.deep);
  rect(c,x,25,w,8,p.main);rect(c,x+1,25,2,7,p.light);rect(c,x+w-2,26,2,8,p.deep);rect(c,x,34,w,2,p.deep);
  if(side){
    rect(c,12,23,4,2,'#eadcbb');
    if(p.garment==='overalls'){rect(c,12,24,2,11,p.accent);rect(c,13,28,7,7,'#41685c');rect(c,15,29,4,3,'#719280');}
    if(['coat','cardigan'].includes(p.garment)){rect(c,11,34,11,3,p.main);rect(c,11,37,11,1,p.deep);rect(c,20,27,1,9,p.light);}
    if(['strap','satchel','bookbag'].includes(p.accessory)){line(c,[18,23],[12,33],'#d1b98a');rect(c,10,31,5,7,'#8d694a');rect(c,10,31,5,2,'#bc986a');rect(c,12,34,1,1,'#e5cb91');}
    if(p.garment==='knit')for(let y=26;y<33;y+=3)rect(c,14,y,3,1,p.accent);
    return;
  }
  if(back){
    rect(c,11,24,10,1,p.light);line(c,[16,26],[16,33],p.deep);
    if(['overalls','vest'].includes(p.garment)){rect(c,11,23,2,9,p.accent);rect(c,19,23,2,9,p.accent);rect(c,11,30,10,5,p.deep);rect(c,12,31,8,1,p.light);}
    if(['coat','cardigan'].includes(p.garment)){rect(c,9,34,14,4,p.main);rect(c,9,37,14,1,p.deep);rect(c,16,34,1,3,p.deep);}
    if(['strap','satchel','bookbag'].includes(p.accessory)){line(c,[10,23],[22,34],p.accent);rect(c,18,29,7,8,'#77563f');rect(c,19,29,6,3,'#b48c61');rect(c,21,33,2,1,'#e7c78a');}
    return;
  }
  polygon(c,[[12,22],[16,26],[20,22]],'#f2e7ce');
  switch(p.garment){
    case 'overalls':
      rect(c,11,23,2,8,p.accent);rect(c,19,23,2,8,p.accent);rect(c,11,28,10,7,'#41685c');rect(c,13,29,6,4,'#6e947b');rect(c,14,30,4,1,'#a3b08b');rect(c,11,27,2,1,'#f0ce83');rect(c,19,27,2,1,'#f0ce83');break;
    case 'field':
      polygon(c,[[10,23],[14,26],[14,34],[10,34]],p.light);polygon(c,[[22,23],[18,26],[18,34],[22,34]],p.deep);rect(c,15,26,2,8,p.accent);
      for(const x of [10,19]){rect(c,x,28,3,4,p.deep);rect(c,x,28,3,1,p.accent);rect(c,x+1,30,1,1,'#eadcbb');}break;
    case 'jacket':
      rect(c,14,26,4,8,'#ded4bb');polygon(c,[[10,23],[15,26],[12,29]],p.light);polygon(c,[[22,23],[17,26],[20,29]],p.light);rect(c,10,32,3,1,p.accent);rect(c,19,32,3,1,p.accent);break;
    case 'cardigan':
      rect(c,13,25,6,12,'#eddfc6');rect(c,12,25,1,12,p.deep);rect(c,19,25,1,12,p.deep);rect(c,9,34,4,4,p.main);rect(c,19,34,4,4,p.main);rect(c,14,27,4,1,'#bb9d89');
      for(const y of [27,31,35])rect(c,20,y,1,1,p.accent);break;
    case 'coat':
      polygon(c,[[11,23],[16,26],[13,29],[10,26]],'#d9c9a9');polygon(c,[[21,23],[17,26],[20,29],[23,26]],'#b7c9b8');rect(c,9,34,14,4,p.main);rect(c,9,37,14,1,p.deep);rect(c,16,27,1,10,p.deep);
      for(const y of [28,32,36])rect(c,17,y,1,1,p.accent);rect(c,10,33,3,1,p.accent);rect(c,20,33,2,1,p.accent);break;
    case 'vest':
      rect(c,13,25,6,10,'#e6d4af');polygon(c,[[10,23],[14,26],[13,34],[9,35]],p.light);polygon(c,[[22,23],[18,26],[19,34],[23,35]],p.deep);rect(c,10,30,3,3,p.deep);rect(c,19,30,3,3,p.light);break;
    case 'shirt':
      polygon(c,[[11,23],[16,26],[13,28]],p.accent);polygon(c,[[21,23],[17,26],[20,28]],p.light);rect(c,16,27,1,8,p.deep);for(const y of [28,31,34])rect(c,17,y,1,1,'#e8d3b6');rect(c,19,28,3,3,p.deep);rect(c,20,27,1,3,p.accent);break;
    case 'knit':
      rect(c,12,23,8,2,p.accent);rect(c,9,33,14,2,p.accent);for(let x=11;x<22;x+=3)for(let y=27;y<33;y+=3){rect(c,x,y,1,1,p.light);rect(c,x+1,y+1,1,1,p.deep);}break;
  }
  if(!['coat','cardigan','knit'].includes(p.garment)){rect(c,10,35,12,1,'#574f41');rect(c,15,34,2,2,p.accent);}
  if(['strap','satchel','bookbag'].includes(p.accessory)){line(c,[10,23],[23,35],'#574b3b',2);line(c,[10,23],[23,35],p.accent);rect(c,22,31,5,7,'#8d694a');rect(c,22,31,5,2,'#bc986a');rect(c,24,34,1,1,'#e5cb91');}
}
function hand(c,x,y,p){rect(c,x,y,3,4,p.skinShadow);rect(c,x,y,2,3,p.skin);rect(c,x,y,1,2,p.skinLight);}
function arm(c,x,y,p,near=false){rect(c,x,y,3,8,near?p.deep:p.main);rect(c,x,y,1,5,near?p.main:p.light);rect(c,x,y+7,3,1,p.accent);hand(c,x,y+8,p);}
function arms(c,p,pose,side,back){
  const stride=pose.motion==='walk'?(pose.smooth?[2,1,0,-1,-2,-1,0,1][pose.phase]:[0,2,0,-2][pose.phase]):0;
  if(pose.motion==='sit'){
    const lower=Math.round(pose.seated*2);
    if(side){rect(c,16,25,3,7-lower,p.main);rect(c,12,30-lower,6,3,p.deep);hand(c,10,30-lower,p);}
    else {rect(c,6,25,3,7-lower,p.main);rect(c,23,25,3,7-lower,p.deep);hand(c,8,30-lower,p);hand(c,21,30-lower,p);}
    return;
  }
  if(['idle','walk'].includes(pose.motion)){if(side)arm(c,16+stride,25,p,true);else{arm(c,6,25+stride,p);arm(c,23,25-stride,p,true);}return;}
  if(pose.motion==='talk'){
    const gesture=pose.smooth?[0,0,1,2,2,1,0,0][pose.phase]:pose.phase;
    if(pose.smooth&&gesture===0){if(side)arm(c,16,25,p,true);else{arm(c,6,25,p);arm(c,23,25,p,true);}return;}
    if(side){rect(c,15,25,3,7,p.main);polygon(c,[[15,30],[10,27-gesture],[7,28-gesture],[11,33],[17,33]],p.main);hand(c,6,25-gesture,p);rect(c,5,24-gesture,1,2,p.skin);}
    else if(back){arm(c,6,25,p);rect(c,23,25,3,7,p.deep);rect(c,25,23-gesture,3,8,p.main);hand(c,25,20-gesture,p);}
    else {arm(c,6,25,p);polygon(c,[[23,25],[26,26],[28,30],[28,24-gesture*2],[31,24-gesture*2],[31,33],[27,35],[23,31]],p.main);hand(c,28,20-gesture*2,p);rect(c,27,20-gesture*2,1,3,p.skin);}
    return;
  }
  if(pose.motion==='rest'){
    const page=pose.smooth?[0,1,0,0][pose.phase]:pose.phase;
    // From behind the reader, the book and inward-facing palms are hidden by
    // the torso. Only the outside sleeves and a quiet shoulder shift are seen.
    if(back){rect(c,6,25+page,3,8,p.main);rect(c,6,26+page,1,5,p.light);rect(c,23,25+page,3,8,p.deep);rect(c,7,32+page,2,2,p.skinShadow);rect(c,23,32+page,2,2,p.skinShadow);}
    else if(side){rect(c,15,26,3,7,p.main);rect(c,10,31,7,3,p.main);hand(c,8,31,p);rect(c,5,32,8,8,'#805e45');polygon(c,[[6,32],[9,33],[12,32-page],[12,38],[9,39],[6,38]],'#e9d7ad');rect(c,9,33,1,5,'#b59a6d');rect(c,6,34+page,2,1,'#b59a6d');if(page)line(c,[10,33],[11,37],'#fff0cf');}
    else {rect(c,6,26,3,8,p.main);rect(c,23,26,3,8,p.deep);hand(c,10,32,p);hand(c,19,32,p);polygon(c,[[11,32],[16,34],[21,32-page],[22,39],[16,40],[10,38]],'#e9d7ad');line(c,[16,34],[16,39],'#a88c62');rect(c,12,35,2,1,'#bfa375');rect(c,18,35+page,2,1,'#bfa375');if(page)line(c,[17,34],[20,37],'#fff0cf');}
    return;
  }
  if(pose.motion==='work'){
    const lift=pose.smooth?[0,0,2,5,6,3,0,0][pose.phase]:[0,2,5,2][pose.phase];
    if(back){rect(c,7,24,3,7,p.main);hand(c,6,22-lift,p);rect(c,24,24,3,7,p.deep);hand(c,24,23,p);rect(c,7,17-lift,2,9,'#b58a54');rect(c,4,16-lift,8,3,'#65838b');rect(c,5,16-lift,6,1,'#b7cbd0');}
    else {rect(c,6,26,3,7,p.main);rect(c,9,31,6,3,p.main);hand(c,13,31,p);rect(c,15,34,7,2,'#b78d62');rect(c,23,25-lift,3,8,p.deep);hand(c,26,24-lift,p);rect(c,28,18-lift,2,14,'#b58a54');rect(c,25,17-lift,7,3,'#65838b');rect(c,26,17-lift,5,1,'#b7cbd0');}
    return;
  }
  if(pose.motion==='camera'){
    const y=pose.smooth?[28,28,25,21,16,16,18,25][pose.phase]:pose.phase?16:26;
    if(back){rect(c,6,25,3,7,p.main);rect(c,23,25,3,7,p.deep);hand(c,5,y+2,p);rect(c,4,y,9,7,'#263d43');rect(c,5,y+1,7,2,'#718b91');rect(c,8,y+3,3,3,'#9bc0c3');rect(c,6,y-1,4,1,'#263d43');}
    else {polygon(c,[[6,26],[9,25],[12,y+4],[11,y+7],[7,y+6]],p.main);polygon(c,[[24,25],[26,26],[25,y+7],[21,y+7],[20,y+4]],p.deep);hand(c,10,y+2,p);hand(c,20,y+2,p);rect(c,11,y,11,7,'#263d43');rect(c,13,y-1,4,1,'#263d43');rect(c,12,y+1,9,2,'#607f8a');rect(c,16,y+2,5,4,'#a5c3c0');rect(c,17,y+3,3,3,'#274b5f');rect(c,18,y+3,1,1,'#e3eee0');rect(c,12,y+3,2,2,'#c8a277');}
  }
}
function head(c,p,pose,side,back){
  const blink=pose.smooth?((pose.motion==='rest'||pose.motion==='idle')&&pose.phase===3):pose.motion==='rest'&&pose.phase===1;
  rect(c,13,21,7,4,p.skinShadow);rect(c,14,21,5,3,p.skin);
  polygon(c,side?[[11,6],[21,6],[24,10],[24,18],[21,22],[13,22],[9,19],[9,17],[7,16],[8,14],[9,14],[9,10]]:[[10,6],[22,6],[25,10],[25,18],[22,22],[11,22],[7,18],[7,11]],p.skinShadow);
  rect(c,side?10:9,10,side?12:14,9,p.skin);rect(c,side?10:9,11,3,7,p.skinLight);rect(c,12,19,9,2,p.skin);
  if(back){polygon(c,[[9,7],[22,7],[25,11],[25,18],[22,22],[11,22],[7,18],[7,11]],p.hair);rect(c,9,11,2,7,p.hairLight);rect(c,13,19,9,2,p.hairDark);rect(c,23,12,2,7,p.hairDark);}
  else {
    if(side){rect(c,9,13,3,1,p.hair);rect(c,9,blink?16:15,2,blink?1:3,INK);if(!blink)rect(c,9,15,1,1,'#f7edda');rect(c,8,18,3,1,p.skinLight);rect(c,10,20,4,1,'#ad7660');rect(c,21,14,3,5,p.skin);rect(c,22,15,2,2,p.skinShadow);}
    else {for(const x of [10,19]){rect(c,x,13,3,1,p.hair);rect(c,x+1,blink?16:15,2,blink?1:3,INK);if(!blink)rect(c,x+1,15,1,1,'#f7edda');}rect(c,15,17,2,2,p.skinShadow);rect(c,13,20,6,1,'#a76f5d');rect(c,10,19,3,1,'#d89579');rect(c,21,19,2,1,'#c98a70');}
  }
  hairStyle(c,p,side,back);
  if(!back&&['glasses','roundglasses'].includes(p.accessory)){
    const rim=p.accessory==='roundglasses'?'#a1835c':'#405b65';
    const glass=(x)=>{rect(c,x,14,6,5,rim);rect(c,x+1,15,4,3,'#a9c9c5');rect(c,x+2,blink?16:15,2,blink?1:3,INK);rect(c,x+1,15,1,1,'#f2efda');};
    if(side){glass(7);rect(c,13,15,9,1,rim);}else{glass(8);glass(18);rect(c,14,15,4,1,rim);}
  }
  if(p.accessory==='scarf'){polygon(c,[[11,22],[16,24],[22,22],[23,25],[18,27],[11,25]],'#c8a269');rect(c,19,26,4,6,'#d7b980');rect(c,20,26,1,5,'#edd4a3');rect(c,19,32,1,2,'#9b7750');rect(c,22,32,1,2,'#9b7750');}
  const speaking=pose.smooth?[false,false,true,true,false,true,false,false][pose.phase]:pose.phase;
  if(!back&&pose.motion==='talk'&&speaking){rect(c,side?10:14,20,side?3:5,2,'#8e5549');rect(c,side?10:14,20,side?2:4,1,'#f2d7ba');}
}
function hairStyle(c,p,side,back){
  // A common outer contour keeps every direction at the same physical scale.
  polygon(c,[[8,14],[6,10],[8,6],[12,3],[21,3],[25,7],[26,12],[24,15],[22,10],[18,8],[14,11],[11,9],[9,14]],p.hairDark);
  polygon(c,[[8,9],[10,5],[15,3],[21,5],[24,8],[23,11],[20,8],[16,9],[12,8],[10,12]],p.hair);
  rect(c,11,6,4,1,p.hairLight);rect(c,15,5,5,1,p.hairLight);
  if(back){rect(c,8,10,17,7,p.hair);rect(c,10,11,2,7,p.hairLight);rect(c,21,11,2,8,p.hairDark);rect(c,13,20,8,2,p.hairDark);}
  switch(p.hairStyle){
    case 'short':
      polygon(c,[[7,9],[9,4],[12,2],[15,4],[19,2],[24,6],[23,9],[19,7],[16,9],[12,7]],p.hair);rect(c,11,5,4,1,p.hairLight);
      if(!back){const x=side?20:23;rect(c,x,7,1,5,'#92ab62');rect(c,x+1,6,3,2,'#b0bf74');rect(c,x+2,5,2,1,'#b0bf74');}break;
    case 'wavy':
      for(const [x,y]of [[6,8],[8,4],[12,2],[17,2],[22,5],[24,9]]){rect(c,x,y,4,4,p.hair);rect(c,x+1,y,2,1,p.hairLight);}if(side)rect(c,21,19,3,2,p.hair);break;
    case 'parted':
      polygon(c,[[7,12],[7,7],[12,3],[18,3],[14,7],[10,12]],p.hair);rect(c,16,4,1,4,p.hairDark);line(c,[9,8],[13,5],p.hairLight);break;
    case 'bun':
      polygon(c,[[side?20:12,6],[side?18:10,3],[side?20:12,1],[side?25:17,1],[side?27:19,4],[side?25:17,7]],p.hair);rect(c,side?20:12,2,4,1,p.hairLight);rect(c,side?19:11,6,8,1,p.accent);
      if(!back){rect(c,side?22:24,13,2,2,'#edc4aa');rect(c,side?23:25,12,2,1,'#bb7f8b');}break;
    case 'bob':
      polygon(c,[[7,8],[10,6],[9,15],[10,21],[8,24],[5,21],[5,12]],p.hair);polygon(c,[[23,7],[26,11],[27,20],[24,24],[21,22],[23,16]],p.hair);rect(c,7,13,1,7,p.hairLight);rect(c,24,13,1,7,p.hairLight);break;
    case 'cap':
      polygon(c,[[6,11],[8,5],[13,2],[21,3],[25,7],[25,12]],'#92936c');rect(c,10,5,9,1,'#b9b78b');line(c,[18,3],[19,10],'#737c59');polygon(c,side?[[4,11],[24,10],[25,13],[5,14],[2,13]]:[[6,11],[25,11],[27,13],[24,15],[9,14],[5,13]],'#72845f');rect(c,8,12,10,1,'#b8b98c');break;
    case 'ponytail':
      polygon(c,[[7,12],[8,6],[13,3],[21,4],[24,8],[21,10],[17,8],[14,11],[10,10]],p.hair);rect(c,11,6,8,1,p.hairLight);rect(c,side?24:25,14,2,2,p.accent);break;
    case 'curls':
      for(const [x,y]of [[5,10],[7,5],[11,2],[16,2],[21,4],[24,8],[25,13],[6,15],[24,18]]){polygon(c,[[x+1,y],[x+4,y],[x+5,y+2],[x+4,y+4],[x+1,y+4],[x,y+2]],p.hair);rect(c,x+1,y+1,2,1,p.hairLight);}break;
  }
}
// One logical-grid scratch tile serves every frame; resetting it gives the same blank,
// default-state surface as a new canvas without allocating 192 canvases per resident.
let tile=null;
function scratchTile(){
  if(!tile)return tile=canvas(32,48);
  const context=tile.getContext('2d');if(context.reset)context.reset();else tile.width=32;
  return tile;
}
function drawResident(c,agent,frame){
  const p=palette(agent),pose=poseFor(frame),side=['left','right'].includes(pose.direction),back=pose.direction==='up';
  const grid=scratchTile(),t=grid.getContext('2d');t.imageSmoothingEnabled=false;t.save();
  if(pose.direction==='right'){t.translate(32,0);t.scale(-1,1);}
  // Seat motion lowers the torso and head while knees fold above planted feet.
  // It does not squash the sprite or move its ground anchor.
  legs(t,p,pose,side,back);t.save();
  if(pose.smooth){
    if(pose.motion==='walk')t.translate(0,[0,0,-1,-1,0,0,-1,-1][pose.phase]);
    else if(pose.motion==='sit'||pose.motion==='rest')t.translate(0,Math.round((pose.seated??1)*5));
    else if(pose.motion==='idle')t.translate(0,pose.phase===1?1:0);
    else if(pose.motion==='talk'&&[3,4].includes(pose.phase))t.translate(side?-1:0,1);
  }else if(pose.motion==='walk'&&pose.phase%2)t.translate(0,-1);
  hairBack(t,p,side);torso(t,p,side,back);head(t,p,pose,side,back);arms(t,p,pose,side,back);t.restore();t.restore();
  c.imageSmoothingEnabled=false;c.drawImage(grid,0,0,64,96);
}
/** Preserve the first 48 frames and add natural motion clips in the same atlas. */
export function registerResidentAssets(scene,agents){
  const characterKeys={};
  for(const agent of agents){const key=identity(agent);if(!scene.textures.exists(key)){
    const columns=16,sheet=canvas(columns*64,Math.ceil(RESIDENT_FRAME_COUNT/columns)*96),c=sheet.getContext('2d');
    for(let frame=0;frame<RESIDENT_FRAME_COUNT;frame++){c.save();c.translate(frame%columns*64,Math.floor(frame/columns)*96);c.beginPath();c.rect(0,0,64,96);c.clip();drawResident(c,agent,frame);c.restore();}
    scene.textures.addSpriteSheet(key,sheet,{frameWidth:64,frameHeight:96,endFrame:RESIDENT_FRAME_COUNT-1});
  }characterKeys[agent.id]=key;}
  return {characterKeys};
}
/** Portraits use the same face, hair and outfit as the world character. */
export function residentPortrait(agent){
  const key=identity(agent);
  if(!portraitCache.has(key)){const portrait=canvas(64,96);drawResident(portrait.getContext('2d'),agent,0);portraitCache.set(key,portrait.toDataURL('image/png'));}
  return portraitCache.get(key);
}
/** Read-only artwork preview for local visual QA, independent of simulation state. */
export function residentPreview(agent,frame=0){
  const preview=canvas(64,96),index=Number.isFinite(frame)?Math.max(0,Math.min(RESIDENT_FRAME_COUNT-1,Math.trunc(frame))):0;
  drawResident(preview.getContext('2d'),agent,index);
  return preview.toDataURL('image/png');
}
