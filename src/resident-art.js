// Original 64 × 96 pixel artwork. This module only creates presentation assets.
// Four-direction idle / walk, furniture-facing work, seated reading and conversation.
// Identity follows the persona, never the shuffled simulation actor ID.
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
const DARK = '#323b3b';
const clamp = n => Math.max(0,Math.min(255,n));
const shade = (hex,amount) => '#'+hex.slice(1).match(/../g).map(x=>clamp(parseInt(x,16)+amount).toString(16).padStart(2,'0')).join('');
const rect = (c,x,y,w,h,color) => { c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h)); };
function shape(c,points,color,outline=null){
  c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=color;c.fill();
  if(outline){c.strokeStyle=outline;c.lineWidth=1;c.lineJoin='bevel';c.stroke();}
}
function line(c,points,color,width=1){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.lineWidth=width;c.strokeStyle=color;c.stroke();}
function canvas(width,height){const value=document.createElement('canvas');value.width=width;value.height=height;return value;}
function palette(agent){
  const person=PEOPLE[agent.name]??FALLBACK;
  const main=/^#[a-f0-9]{6}$/i.test(agent.color)?agent.color:'#367760';
  return {...person,main,light:shade(main,26),deep:shade(main,-35),skinLight:shade(person.skin,18),skinShadow:shade(person.skin,-25),hairLight:shade(person.hair,28)};
}
function identity(agent){const p=palette(agent);return `resident-detail-v2-${p.id}-${p.main.slice(1).toLowerCase()}`;}

function poseFor(frame){
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

function shoe(c,x,y,p,side=false){
  shape(c,[[x+1,y],[x+8,y],[x+9,y+3],[x+12,y+4],[x+12,y+7],[x-1,y+7],[x-1,y+4]],p.shoes,shade(p.shoes,-12));
  rect(c,x-1,y+6,13,2,'#b9aa91');rect(c,x+2,y+1,5,1,shade(p.shoes,30));
  if(!side){rect(c,x+3,y+2,5,1,'#b6a78d');rect(c,x+3,y+4,5,1,'#9d907c');}
}
function legs(c,p,pose,side,back){
  const stride=pose.motion==='walk'?[0,5,0,-5][pose.phase]:0;
  if(pose.motion==='rest'){
    if(side){
      shape(c,[[25,62],[39,63],[39,73],[19,75],[18,85],[10,85],[10,70],[27,68]],p.pants,DARK);
      line(c,[[29,66],[31,71],[16,71],[15,81]],shade(p.pants,24));
      shoe(c,8,82,p,true);shoe(c,20,81,p,true);return;
    }
    shape(c,[[21,64],[43,64],[45,72],[38,76],[25,76],[18,72]],p.pants,DARK);
    shape(c,[[19,71],[28,72],[26,82],[17,83],[17,78]],shade(p.pants,9),DARK);
    shape(c,[[36,72],[44,71],[47,82],[38,83]],shade(p.pants,-9),DARK);
    shoe(c,15,82,p);shoe(c,38,82,p);return;
  }
  if(side){
    const near=32+stride,far=29-stride;
    shape(c,[[25,61],[36,61],[far+7,76],[far+6,87],[far-2,87],[far-3,76]],shade(p.pants,-17),DARK);
    shoe(c,far-4,85,p,true);
    shape(c,[[27,62],[36,62],[near+4,74],[near+2,87],[near-6,87],[near-6,74]],p.pants,DARK);
    line(c,[[30,66],[near-1,76],[near-2,84]],shade(p.pants,23));shoe(c,near-8,85,p,true);
  }else{
    for(const [x,step,offset] of [[22,stride,8],[34,-stride,-4]]){
      const footY=85+Math.round(step/2),pant=shade(p.pants,offset);
      shape(c,[[x,61],[x+10,61],[x+9,74],[x+8,footY+2],[x+1,footY+2],[x,75]],pant,DARK);
      rect(c,x+2,67,2,12,shade(pant,15));rect(c,x+3,81+Math.round(step/2),5,2,shade(pant,-18));
      shoe(c,x-2,footY,p);
      if(back)rect(c,x,footY+1,8,2,shade(p.shoes,-15));
    }
  }
}

function torso(c,p,side,back){
  const outline=shade(p.deep,-10);
  if(side){
    shape(c,[[25,37],[36,37],[42,44],[40,65],[23,66],[21,48]],p.main,outline);
    rect(c,23,44,4,17,p.light);rect(c,37,44,3,18,p.deep);rect(c,25,63,14,3,p.deep);
    shape(c,[[25,37],[28,42],[33,42],[35,37]],'#e4dac3');
    if(['coat','cardigan'].includes(p.garment)){rect(c,23,61,16,7,p.main);rect(c,24,66,14,2,p.deep);}
    if(p.garment==='overalls'){rect(c,23,42,3,23,p.accent);rect(c,27,51,11,13,p.deep);rect(c,29,53,7,2,p.light);}
    if(['satchel','bookbag','strap'].includes(p.accessory)){
      line(c,[[34,40],[26,61]],'#b39a70',2);rect(c,22,58,10,12,'#a88053');rect(c,23,59,8,4,'#c4a174');rect(c,26,64,3,2,'#e2c58a');
    }
    return;
  }
  shape(c,[[22,37],[41,37],[46,43],[45,62],[43,67],[20,67],[18,61],[18,44]],p.main,outline);
  rect(c,20,44,3,16,p.light);rect(c,40,42,4,20,p.deep);rect(c,22,64,20,3,p.deep);
  if(back){
    line(c,[[23,42],[39,42]],shade(p.main,13));line(c,[[31,45],[31,62]],shade(p.main,-13));
    if(['overalls','vest'].includes(p.garment)){rect(c,24,39,3,21,p.accent);rect(c,36,39,3,21,p.accent);rect(c,24,56,15,9,p.deep);}
    if(['coat','cardigan'].includes(p.garment)){rect(c,21,63,23,8,p.main);rect(c,21,69,23,2,p.deep);rect(c,31,64,1,7,p.deep);}
    if(['satchel','bookbag','strap'].includes(p.accessory)){
      line(c,[[23,38],[40,65]],p.accent,2);rect(c,36,58,10,13,'#98704e');rect(c,37,59,9,4,'#c3a477');rect(c,40,64,2,3,'#e4c989');
    }
    return;
  }
  shape(c,[[25,37],[31,43],[37,37]],'#f3e4c9');
  switch(p.garment){
    case 'overalls':
      rect(c,24,39,3,22,'#cebb8f');rect(c,37,39,3,22,'#cebb8f');
      shape(c,[[25,47],[39,47],[40,65],[23,65]],'#42635a',shade(p.deep,-10));
      rect(c,28,50,9,8,'#597a68');rect(c,29,51,7,1,'#86a28a');rect(c,25,46,2,2,'#e8c479');rect(c,38,46,2,2,'#e8c479');
      rect(c,25,60,14,1,'#b4ac80');break;
    case 'field':
      shape(c,[[24,38],[30,44],[30,64],[23,64]],p.light);
      shape(c,[[38,38],[33,44],[33,64],[41,64]],p.deep);
      for(const x of [23,35]){rect(c,x,47,7,7,shade(p.main,-12));rect(c,x,47,7,2,p.light);rect(c,x+3,49,1,1,p.accent);}
      rect(c,31,44,2,20,p.accent);break;
    case 'jacket':
      rect(c,28,43,8,21,'#ded4bb');shape(c,[[23,38],[30,45],[27,51],[24,48]],p.light);
      shape(c,[[40,38],[33,45],[37,51],[41,48]],shade(p.main,-17));
      rect(c,23,57,6,2,p.light);rect(c,37,57,5,2,p.light);rect(c,31,51,1,10,'#a49680');break;
    case 'cardigan':
      rect(c,27,40,10,27,'#eddfc6');rect(c,26,43,1,22,p.deep);rect(c,37,43,2,25,p.deep);
      rect(c,20,63,7,8,p.main);rect(c,37,63,7,8,p.main);rect(c,20,69,7,2,p.deep);rect(c,37,69,7,2,p.deep);
      for(const y of [49,55,61])rect(c,39,y,2,2,p.accent);
      rect(c,29,44,6,3,'#c8b09a');rect(c,28,52,8,1,'#cdbdad');break;
    case 'coat':
      shape(c,[[25,37],[31,43],[28,49],[23,44]],'#d9c9a9');shape(c,[[39,37],[33,43],[36,49],[41,43]],'#b6c7bc');
      rect(c,21,64,23,8,p.main);rect(c,21,69,23,3,p.deep);rect(c,31,46,1,24,p.deep);
      for(const y of [49,56,64])rect(c,33,y,2,2,p.accent);rect(c,23,58,6,2,p.light);rect(c,37,58,5,2,p.light);break;
    case 'vest':
      rect(c,27,41,10,25,'#e6d4af');shape(c,[[22,38],[29,43],[28,63],[22,66]],p.light);
      shape(c,[[41,38],[35,43],[36,64],[43,66]],p.deep);rect(c,22,54,6,5,shade(p.main,-10));rect(c,37,54,6,5,shade(p.main,-10));
      rect(c,23,54,4,1,p.accent);rect(c,38,54,4,1,p.accent);break;
    case 'shirt':
      shape(c,[[24,37],[31,43],[27,46],[23,42]],p.accent);shape(c,[[39,37],[33,43],[37,46],[42,41]],p.light);
      rect(c,31,44,2,21,p.deep);for(const y of [46,52,58,64])rect(c,32,y,1,1,'#e0c5aa');
      rect(c,36,47,6,6,p.deep);rect(c,36,47,6,1,p.accent);rect(c,38,44,1,6,'#c9ac74');break;
    case 'knit':
      rect(c,25,37,13,4,p.accent);rect(c,20,61,24,5,p.accent);
      for(const x of [24,29,34,39])for(const y of [45,49,53,57]){rect(c,x,y,1,2,p.light);rect(c,x+1,y+2,1,1,p.deep);}
      break;
  }
  // Belts, pockets and an optional strap are part of the clothing, not held research equipment.
  if(!['coat','cardigan','knit'].includes(p.garment)){rect(c,22,65,21,2,'#554d40');rect(c,30,64,4,3,p.accent);rect(c,31,65,2,1,'#6d6755');}
  if(['strap','satchel','bookbag'].includes(p.accessory)){
    line(c,[[23,39],[41,64]],'#634d3e',3);line(c,[[23,39],[41,64]],p.accent,1);
    rect(c,40,58,10,13,'#8e684b');rect(c,41,59,8,4,'#b78f61');rect(c,44,63,2,3,'#e0c388');
  }
}

function hand(c,x,y,p,open=false){
  shape(c,[[x,y],[x+5,y],[x+6,y+4],[x+4,y+7],[x+1,y+7],[x-1,y+4]],p.skin,p.skinShadow);
  rect(c,x+1,y+1,3,4,p.skinLight);if(open){rect(c,x-2,y-2,2,5,p.skin);rect(c,x+1,y-4,2,5,p.skin);rect(c,x+4,y-2,2,4,p.skin);}
}
function arms(c,p,pose,side,back){
  const stride=pose.motion==='walk'?[0,4,0,-4][pose.phase]:0;
  if(back&&['work','camera','rest','talk'].includes(pose.motion)){
    const lift=pose.motion==='work'?[0,-3,-5,-2][pose.phase]:pose.phase?-2:0;
    for(const [x,main] of [[16,p.main],[43,p.deep]]){
      shape(c,[[x+2,41],[x+7,43],[x+6,54],[x+1,56],[x-2,50+lift],[x,46+lift]],main,shade(p.deep,-12));
      rect(c,x,48+lift,4,3,p.accent);hand(c,x-1,43+lift,p);
    }
    if(pose.motion==='work'){
      rect(c,14,34+lift,3,15,'#b08a54');rect(c,10,32+lift,12,5,'#6e8386');rect(c,11,32+lift,9,2,'#bcc9c1');
    }else if(pose.motion==='camera'){
      rect(c,14,30+lift,12,10,'#334752');rect(c,16,28+lift,6,3,'#667f86');rect(c,15,32+lift,5,5,'#a8c2bd');
      line(c,[[20,39],[18,52],[23,57]],'#8d7e67');
    }
    return;
  }
  if(side){
    if(pose.motion==='rest'||pose.motion==='talk'){
      const lift=pose.phase?-2:0;
      shape(c,[[29,41],[35,43],[34,53],[21,58+lift],[17,54+lift],[27,49]],p.main,shade(p.deep,-12));
      hand(c,15,51+lift,p,pose.motion==='talk');
      if(pose.motion==='rest'){
        shape(c,[[9,52],[19,54],[25,51],[25,65],[18,68],[8,64]],'#c8aa72','#746646');
        line(c,[[17,55],[17,65]],'#f0e1b9');rect(c,10,55,5,7,'#ebe0be');rect(c,20,55,3,7,'#ded2ad');
      }
      return;
    }
    const dx=stride;
    shape(c,[[30,41],[36,42],[36+dx,55],[33+dx,63],[28+dx,61],[29+dx,54]],p.deep,shade(p.deep,-12));
    rect(c,30+dx,54,5,3,p.accent);hand(c,28+dx,59,p);return;
  }
  const ordinaryArms=back||['idle','walk'].includes(pose.motion)?[[16,stride,false],[43,-stride,true]]:pose.motion==='talk'?[[16,stride,false]]:[];
  for(const [x,dy,near] of ordinaryArms){
    const main=near?p.deep:p.main;
    shape(c,[[x+2,41],[x+6,43],[x+6,54+dy],[x+4,60+dy],[x-1,59+dy],[x,47]],main,shade(p.deep,-10));
    rect(c,x,53+dy,5,3,p.accent);rect(c,x+1,43,2,9,near?p.main:p.light);
    hand(c,x,58+dy,p);
  }
  if(back)return;
  if(pose.motion==='talk'){
    // The raised palm and turning forearm give conversations a readable silhouette.
    const lift=pose.phase?4:0;
    shape(c,[[43,42],[48,44],[51,50-lift],[53,43-lift],[57,45-lift],[55,58-lift],[49,60-lift],[43,52]],p.main,shade(p.deep,-10));
    hand(c,52,35-lift,p,true);
  }else if(pose.motion==='work'){
    const lift=[0,6,13,5][pose.phase];
    shape(c,[[44,43],[49,43],[54,52-lift],[52,57-lift],[46,53]],p.main,shade(p.deep,-10));
    hand(c,49,48-lift,p);rect(c,54,35-lift,3,21,'#976b43');rect(c,55,35-lift,1,20,'#d2a673');
    shape(c,[[48,34-lift],[59,34-lift],[61,36-lift],[60,41-lift],[47,41-lift]],'#6f8590','#354c57');rect(c,49,35-lift,10,2,'#a7bcc2');
    shape(c,[[18,44],[22,44],[26,56],[31,57],[30,63],[22,61],[17,52]],p.main,shade(p.deep,-10));hand(c,28,56,p);
    rect(c,29,59,14,4,'#b59062');rect(c,30,59,12,1,'#e1c58c');
  }else if(pose.motion==='rest'){
    shape(c,[[19,44],[23,48],[27,57],[25,63],[19,58],[16,49]],p.main,p.deep);
    shape(c,[[44,44],[40,48],[38,57],[42,62],[47,56],[48,49]],p.deep,shade(p.deep,-12));
    hand(c,22,57,p);hand(c,38,57,p);
    shape(c,[[25,58],[32,60],[39,58],[41,70],[33,72],[24,69]],'#e9d7ad','#9c825f');
    line(c,[[32,61],[33,70]],'#aa9370');for(const y of [63,66]){line(c,[[26,y],[30,y+1]],'#b6a17b');line(c,[[35,y+1],[38,y]],'#b6a17b');}
  }else if(pose.motion==='camera'){
    const cameraY=pose.phase?26:45;
    shape(c,[[18,43],[22,43],[25,cameraY+6],[26,cameraY+10],[20,cameraY+12],[16,47]],p.main,p.deep);
    shape(c,[[43,43],[47,43],[48,49],[42,cameraY+12],[39,cameraY+9],[41,cameraY+5]],p.deep,shade(p.deep,-14));
    hand(c,22,cameraY+3,p);hand(c,38,cameraY+3,p);
    rect(c,25,cameraY,17,12,'#293c46');rect(c,27,cameraY-2,7,3,'#3c515b');rect(c,26,cameraY+2,15,2,'#536b73');
    rect(c,30,cameraY+3,9,8,'#8ba5ac');rect(c,32,cameraY+4,6,6,'#233c50');rect(c,33,cameraY+5,2,2,'#a7c9d7');rect(c,26,cameraY+5,2,4,'#b18e5c');
    if(pose.phase)rect(c,39,cameraY-1,3,2,'#eee0b3');
  }
}

function hairBack(c,p,side){
  if(['bob','ponytail','bun'].includes(p.hairStyle)){
    if(side){shape(c,[[34,15],[42,21],[43,33],[40,41],[33,41],[31,27]],p.hair,shade(p.hair,-16));}
    else shape(c,[[21,16],[42,16],[46,26],[44,41],[39,45],[23,42],[18,34]],p.hair,shade(p.hair,-16));
  }
  if(p.hairStyle==='ponytail'){
    const x=side?42:43;shape(c,[[x,21],[x+5,23],[x+7,30],[x+5,45],[x+1,49],[x-1,43],[x+1,32]],p.hair,shade(p.hair,-15));
    rect(c,x,25,5,3,p.accent);rect(c,x+3,31,1,9,p.hairLight);
  }
}
function head(c,p,pose,side,back){
  rect(c,27,32,11,9,p.skinShadow);rect(c,29,33,7,7,p.skin);
  if(side){
    shape(c,[[25,13],[35,12],[42,17],[43,29],[38,36],[29,37],[23,33],[23,28],[19,27],[20,24],[23,23],[22,17]],p.skin,p.skinShadow);
    rect(c,24,21,3,8,p.skinLight);rect(c,36,28,5,4,p.skinShadow);rect(c,29,33,8,2,shade(p.skin,-12));
    rect(c,23,22,3,2,'#39404a');rect(c,23,21,4,1,p.hair);rect(c,23,24,1,1,'#e9d4ad');rect(c,22,30,5,1,'#ad7660');
    shape(c,[[23,15],[24,11],[31,9],[39,11],[43,17],[42,28],[38,31],[36,23],[32,19],[23,20]],p.hair,shade(p.hair,-15));
    line(c,[[27,13],[34,12],[38,15]],p.hairLight,2);rect(c,36,25,4,5,p.skin);rect(c,37,27,2,2,p.skinShadow);
  }else{
    shape(c,[[24,12],[38,12],[43,17],[44,28],[41,34],[36,38],[27,37],[21,32],[20,20]],p.skin,p.skinShadow);
    rect(c,19,23,3,7,p.skinShadow);rect(c,43,23,3,7,p.skinShadow);rect(c,22,17,5,13,p.skinLight);
    rect(c,27,33,11,3,shade(p.skin,-9));rect(c,38,18,4,13,shade(p.skin,-12));
    if(!back){
      rect(c,24,23,5,1,p.hair);rect(c,36,23,5,1,p.hair);
      rect(c,25,25,3,3,'#303941');rect(c,37,25,3,3,'#303941');rect(c,25,25,1,1,'#f6edda');rect(c,37,25,1,1,'#f6edda');
      rect(c,31,27,2,3,p.skinShadow);rect(c,32,29,2,1,p.skinLight);rect(c,29,33,7,1,'#b27863');rect(c,30,34,4,1,p.skinLight);
      rect(c,23,30,4,1,'#d69176');rect(c,38,30,3,1,'#c9886b');
    }
    shape(c,[[20,22],[20,15],[23,10],[28,8],[38,9],[43,13],[45,20],[43,25],[40,20],[38,15],[33,18],[28,16],[25,21]],p.hair,shade(p.hair,-15));
    line(c,[[24,14],[29,11],[36,12]],p.hairLight,2);rect(c,23,18,2,8,p.hair);rect(c,42,18,2,10,p.hair);
    if(back){
      shape(c,[[21,16],[41,15],[44,26],[41,34],[35,38],[26,36],[21,30]],p.hair,shade(p.hair,-13));
      line(c,[[26,18],[25,25],[28,32]],p.hairLight);line(c,[[35,18],[39,25],[36,32]],shade(p.hair,13));
      rect(c,28,36,8,2,shade(p.hair,-12));
    }
  }
  hairStyle(c,p,side,back);
  if(!back&&['glasses','roundglasses'].includes(p.accessory)){
    const rim=p.accessory==='roundglasses'?'#ab8963':'#435963';
    if(side){rect(c,21,23,8,6,rim);rect(c,22,24,5,3,'#b8d1cd');rect(c,24,25,2,2,'#3d525a');line(c,[[29,24],[38,25]],rim);}
    else {
      for(const x of [22,35]){rect(c,x,23,8,7,rim);rect(c,x+1,24,6,4,'#b8d1cd');rect(c,x+3,25,2,3,'#3d525a');rect(c,x+1,24,2,1,'#e0e4d4');}
      rect(c,30,25,5,1,rim);rect(c,20,25,2,1,rim);rect(c,43,25,2,1,rim);
    }
  }
  if(p.accessory==='scarf'){
    shape(c,[[24,36],[36,38],[41,35],[42,40],[35,44],[24,41]],'#c8a269','#896846');
    rect(c,36,42,6,13,'#d7b980');rect(c,37,43,2,10,'#ecd29c');rect(c,37,54,1,3,'#9b7750');rect(c,40,54,1,3,'#9b7750');
  }
  if(pose.motion==='talk'&&pose.phase&&!side&&!back){rect(c,29,33,7,3,'#8e5549');rect(c,30,33,5,1,'#efcfb3');}
  if(pose.motion==='rest'&&pose.phase&&!side&&!back){rect(c,24,25,5,3,p.skin);rect(c,36,25,5,3,p.skin);rect(c,24,26,5,1,p.hair);rect(c,36,26,5,1,p.hair);}
}

function hairStyle(c,p,side,back){
  switch(p.hairStyle){
    case 'short':
      shape(c,[[22,15],[23,10],[29,7],[32,10],[38,8],[42,14],[38,17],[32,14],[27,18]],p.hair,shade(p.hair,-12));
      rect(c,26,12,6,2,p.hairLight);rect(c,35,11,4,2,p.hairLight);
      if(!back){const x=side?34:39;rect(c,x,14,2,8,'#92ab62');shape(c,[[x,16],[x+5,12],[x+6,15],[x+2,18]],'#b0bf74');}
      break;
    case 'wavy':
      for(const [x,y] of [[20,13],[23,8],[29,6],[35,7],[40,11],[42,17]]){rect(c,x,y,5,6,p.hair);rect(c,x+1,y+1,3,1,p.hairLight);}
      if(side)rect(c,37,29,5,4,shade(p.hair,5));break;
    case 'parted':
      shape(c,[[20,18],[21,12],[27,8],[34,9],[29,15],[23,22]],p.hair);shape(c,[[32,10],[39,9],[44,16],[43,23],[39,18]],p.hair);
      line(c,[[30,11],[25,15],[22,18]],p.hairLight);rect(c,32,10,1,5,shade(p.hair,-17));break;
    case 'bun':
      shape(c,[[side?36:25,9],[side?35:24,4],[side?40:30,1],[side?46:37,4],[side?47:38,9],[side?42:32,12]],p.hair,shade(p.hair,-15));
      rect(c,side?38:27,5,7,2,p.hairLight);rect(c,side?37:24,10,13,2,p.accent);
      if(!back){rect(c,side?39:43,20,3,3,'#e9b69b');rect(c,side?41:45,19,4,2,'#bc7e80');}
      break;
    case 'bob':
      shape(c,[[20,16],[23,11],[27,11],[26,22],[24,32],[21,37],[18,32]],p.hair,shade(p.hair,-14));
      shape(c,[[39,13],[44,16],[46,29],[43,37],[39,35],[40,23]],p.hair,shade(p.hair,-14));
      line(c,[[21,20],[21,30],[22,33]],p.hairLight);line(c,[[42,20],[43,29],[41,34]],p.hairLight);break;
    case 'cap':
      shape(c,[[20,17],[22,9],[29,5],[38,7],[43,12],[43,20],[23,21]],'#99966d','#5d674f');
      line(c,[[23,14],[26,9],[32,8]],'#c3ba87',2);line(c,[[33,7],[35,17]],'#7a805e');
      shape(c,side?[[17,19],[41,18],[42,22],[16,23],[12,21]]:[[19,19],[43,19],[47,22],[43,25],[24,24],[18,22]],'#7d875f','#53634e');
      rect(c,side?19:25,20,14,1,'#b4b381');break;
    case 'ponytail':
      shape(c,[[21,19],[22,12],[28,8],[37,9],[42,14],[40,18],[34,16],[30,20],[25,19]],p.hair);
      line(c,[[25,13],[31,11],[37,13]],p.hairLight,2);rect(c,side?41:44,24,3,3,'#b9a6c5');break;
    case 'curls':
      for(const [x,y] of [[19,18],[20,12],[24,8],[30,7],[36,9],[40,13],[42,19],[20,25],[42,26]]){
        shape(c,[[x+1,y],[x+5,y],[x+7,y+3],[x+5,y+6],[x+1,y+6],[x-1,y+3]],p.hair,shade(p.hair,-9));rect(c,x+1,y+1,3,1,p.hairLight);
      }break;
  }
}

function drawResident(c,agent,frame){
  const p=palette(agent),pose=poseFor(frame),side=pose.direction==='left'||pose.direction==='right',back=pose.direction==='up';
  c.save();c.imageSmoothingEnabled=false;
  if(pose.direction==='right'){c.translate(64,0);c.scale(-1,1);}
  // Frame padding accommodates tools and hair while feet stay on the same baseline.
  const bob=pose.motion==='walk'&&pose.phase%2?-1:0;
  c.translate(0,bob);
  legs(c,p,pose,side,back);
  hairBack(c,p,side);
  torso(c,p,side,back);
  head(c,p,pose,side,back);
  arms(c,p,pose,side,back);
  c.restore();
}

/** Register resident sheets in a Phaser TextureManager without changing agents. */
export function registerResidentAssets(scene,agents){
  const characterKeys={};
  for(const agent of agents){
    const key=identity(agent);
    if(!scene.textures.exists(key)){
      const sheet=canvas(640,480),c=sheet.getContext('2d');
      for(let frame=0;frame<48;frame++){
        c.save();c.translate((frame%10)*64,Math.floor(frame/10)*96);c.beginPath();c.rect(0,0,64,96);c.clip();
        drawResident(c,agent,frame);c.restore();
      }
      scene.textures.addSpriteSheet(key,sheet,{frameWidth:64,frameHeight:96,endFrame:47});
    }
    characterKeys[agent.id]=key;
  }
  return {characterKeys};
}

/** Same original character art for the HTML inspector and resident buttons. */
export function residentPortrait(agent){
  const key=identity(agent);
  if(!portraitCache.has(key)){
    const portrait=canvas(64,96);drawResident(portrait.getContext('2d'),agent,0);
    portraitCache.set(key,portrait.toDataURL('image/png'));
  }
  return portraitCache.get(key);
}
