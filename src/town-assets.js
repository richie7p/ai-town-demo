import { registerResidentAssets } from './resident-art.js';
import { detailFurniture, detailGround, detailTree, drawDetailedWall } from './environment-detail.js';
import { WORLD_SIZE, ZONE_CENTERS, MAP_ROOMS, MAP_TILES, MAP_WALLS, MAP_OBJECTS } from './town-map.js';
import { FURNITURE_ATLAS_KEY, FURNITURE_ATLAS_URL, ATLAS_TILE, ATLAS_COLUMNS, ATLAS_ROWS, alphaBounds, atlasRecipe, layoutSprites } from './furniture-atlas.js';
// Original code-drawn tiles. Visible solids share the collision map.
const BACKGROUND_KEY='town-walkable-floor-v8';
const cv=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
const r=(c,x,y,w,h,col)=>{c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
function e(c,x,y,rx,ry,col){c.fillStyle=col;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();}
function p(c,pts,col){c.fillStyle=col;c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();}
const noise=(x,y)=>((Math.imul(x+71,73856093)^Math.imul(y+27,19349663))>>>0)/4294967296;
function mug(c,x,y,col='#fff3d9'){r(c,x,y,8,7,col);r(c,x+8,y+1,3,4,col);r(c,x+2,y,4,2,'#735844');r(c,x+2,y+7,5,1,'#a49279');}
function book(c,x,y,w,h,col){r(c,x,y,w,h,'#52655a');r(c,x+1,y,w-2,h-2,col);r(c,x+2,y+2,w-4,2,'#e8d7b1');}
function plant(c,x,y,s=1){r(c,x-6*s,y,12*s,11*s,'#a77a5e');r(c,x-8*s,y-2*s,16*s,4*s,'#c79c78');r(c,x-4*s,y+3*s,3*s,6*s,'#d2a480');r(c,x-s,y-22*s,2*s,22*s,'#52724a');p(c,[[x,y-9*s],[x-13*s,y-18*s],[x-12*s,y-25*s],[x-5*s,y-23*s],[x,y-12*s]],'#477454');p(c,[[x,y-7*s],[x+13*s,y-16*s],[x+14*s,y-24*s],[x+6*s,y-21*s],[x,y-12*s]],'#689361');p(c,[[x,y-17*s],[x-5*s,y-29*s],[x,y-35*s],[x+5*s,y-29*s]],'#7fa36b');}
function furniture(c,o){
 const w=o.width,h=o.height,edge='#745e4f',wood='#bd966f',top='#d4b48a';
 const box=(x,y,bw,bh,t=top)=>{r(c,x+2,y+5,bw,bh,'#6a665753');r(c,x,y,bw,bh,edge);r(c,x+2,y+2,bw-4,bh-6,t);r(c,x+2,y+bh-7,bw-4,5,wood);};
 switch(o.kind){
 case 'bed':{const tone=['#7b9b96','#bd917c','#8c99b8','#b6a477'][(o.tone||0)%4];r(c,2,0,w-4,h,edge);r(c,6,-8,w-12,17,'#b18a66');r(c,8,-6,w-16,4,'#ebcda1');r(c,6,6,w-12,h-13,'#eee5cd');r(c,10,11,w-20,18,'#fff8df');r(c,13,14,w-26,9,'#f8f1dd');r(c,6,35,w-12,h-43,tone);r(c,6,33,w-12,10,'#e5dec2');for(let y=51;y<h-8;y+=14)r(c,8,y,w-16,2,'#ffffff22');r(c,6,h-9,w-12,6,'#ab8867');r(c,4,h-2,6,5,edge);r(c,w-10,h-2,6,5,edge);break;}
 case 'bookshelf':{box(0,-18,w,h+18,'#735c49');for(let row=0;row<2;row++){const y=-14+row*22;for(let x=6;x<w-8;x+=9){const b=(Math.floor(x/9)+row)%5;r(c,x,y+3+b%3,6,15-b%3,['#899b78','#bd8e6c','#7e9aa0','#beaf7e','#a27b79'][b]);r(c,x+1,y+6,4,1,'#eddfc3');}r(c,3,y+20,w-6,3,top);}r(c,0,-21,w,5,'#ebcda1');break;}
 case 'cabinet':case 'counter':case 'cafeCounter':{box(0,-8,w,h+8,'#c7b897');for(let x=3;x<w-4;x+=32){r(c,x,h-25,28,22,'#a79070');r(c,x+2,h-23,24,18,'#c3a983');r(c,x+21,h-20,3,3,'#776a55');}r(c,-2,-10,w+4,12,'#f0ddba');r(c,0,1,w,4,'#bdaf91');if(o.kind==='cafeCounter'){box(12,-28,54,34,'#a4b4af');r(c,17,-24,44,15,'#dde3d5');r(c,23,-19,16,7,'#536660');r(c,48,-20,7,7,'#b58364');r(c,24,-6,6,8,'#64796c');mug(c,37,3);for(let i=0;i<5;i++){r(c,91+i*21,-12,12,18,['#d5b67b','#b88d6a','#7f9a77'][i%3]);r(c,90+i*21,-15,14,4,'#6b7562');}r(c,210,-4,30,19,'#6c806d');r(c,214,-1,22,2,'#ece1bc');r(c,214,5,16,2,'#ece1bc');}else if(o.kind==='counter'){r(c,14,-4,35,13,'#889b98');r(c,18,-2,27,8,'#c9dad0');r(c,35,-17,3,14,'#788e87');r(c,27,-17,11,3,'#c9dad0');mug(c,w-23,1);}else{for(let x=12;x<w-12;x+=39){r(c,x,-18,23,15,'#7f8d79');r(c,x+2,-16,19,4,'#b9c2a6');r(c,x+8,-12,7,5,'#bda780');}}break;}
 case 'toolwall':{box(0,-34,w,h+34,'#c3ad84');for(let y=-27;y<15;y+=8)for(let x=7;x<w-4;x+=8)r(c,x,y,2,2,'#9f8b6b');for(let x=13;x<w-20;x+=35){r(c,x,-23,4,31,'#876650');r(c,x-6,-24,17,7,'#8faaa3');r(c,x+17,-21,3,21,'#678778');r(c,x+14,-23,9,4,'#bcc9bc');}r(c,0,23,w,9,'#d3b18a');break;}
 case 'workbench':case 'editdesk':{box(0,-4,w,h+4,o.kind==='workbench'?'#d4b184':'#b1c1bb');r(c,4,h-14,w-8,3,'#7e7962');r(c,8,h-9,9,13,edge);r(c,w-17,h-9,9,13,edge);if(o.kind==='workbench'){r(c,15,7,51,29,'#eae1bd');r(c,20,12,35,2,'#819282');r(c,24,18,27,2,'#819282');r(c,26,23,2,11,'#819282');r(c,80,9,18,26,'#a7b49b');r(c,84,13,10,4,'#d8dfbd');r(c,116,9,5,32,'#b77453');r(c,107,10,22,8,'#7b8c81');r(c,146,19,26,5,'#728f88');r(c,164,16,8,11,'#a6b6ab');mug(c,174,6,'#9baa8e');}else{for(const x of [18,113]){r(c,x,-17,53,34,'#52675f');r(c,x+3,-14,47,27,'#8aa9a2');r(c,x+6,-10,25,2,'#d3dfcd');r(c,x+7,-4,36,10,'#74968e');r(c,x+22,17,10,6,'#758b80');r(c,x+14,23,27,4,'#7b8f83');r(c,x+1,32,50,12,'#71867b');for(let y=35;y<43;y+=4)for(let xx=x+5;xx<x+47;xx+=6)r(c,xx,y,4,2,'#bfd0bd');}mug(c,91,22);}break;}
 case 'armchair':{const tone=o.tone?'#c19079':'#819e8d';r(c,4,25,5,9,edge);r(c,23,25,5,9,edge);r(c,3,-9,26,31,'#526d61');r(c,5,-7,22,18,tone);r(c,5,13,22,14,tone);r(c,6,13,20,3,'#cbd3ad');r(c,1,7,5,22,'#6f8d7c');r(c,26,7,5,22,'#6f8d7c');break;}
 case 'chair':case 'stool':{r(c,7,21,4,13,edge);r(c,22,21,4,13,edge);r(c,4,8,25,17,'#756451');r(c,5,7,23,13,o.kind==='chair'?'#91a293':'#c8a57b');r(c,7,9,19,2,'#e1cfaa');if(o.kind==='chair'){r(c,5,-5,3,19,edge);r(c,24,-5,3,19,edge);r(c,4,-7,24,9,'#88a08e');}break;}
 case 'coffee':{box(0,2,w,h-2);book(c,12,6,24,16,'#8b9e8a');book(c,39,8,23,16,'#b38873');mug(c,76,9);break;}
 case 'cafeTable':{r(c,24,h-10,7,15,edge);r(c,w-31,h-10,7,15,edge);e(c,w/2,h/2+4,w/2-1,h/2,'#766657');e(c,w/2,h/2-2,w/2-2,h/2-2,'#d8b88e');e(c,w/2,h/2-5,w/2-5,h/2-6,'#e3c49c');mug(c,19,20);mug(c,w-29,30,'#8ba492');book(c,41,16,19,25,'#81968a');break;}
 case 'plant':plant(c,w/2,h-12,1.25);break;
 case 'planter':{box(0,6,w,h-6,'#a7a389');for(let x=14;x<w;x+=21){e(c,x,4,13,10,'#668d60');e(c,x-5,-3,8,9,'#86a76e');for(let i=0;i<3;i++)r(c,x-7+i*6,-4+(i%2)*7,5,5,['#d4ad8f','#e5d3a2','#a7bb92'][i]);}break;}
 case 'bench':{r(c,7,h-10,5,15,edge);r(c,w-12,h-10,5,15,edge);r(c,6,-13,4,28,edge);r(c,w-10,-13,4,28,edge);for(let i=0;i<3;i++)r(c,0,-16+i*7,w,5,'#b69168');for(let i=0;i<3;i++)r(c,0,10+i*6,w,5,'#caaa7d');break;}
 case 'backdrop':{r(c,4,-15,4,h+12,'#687a70');r(c,w-8,-15,4,h+12,'#687a70');r(c,1,-19,w-2,6,'#71887c');r(c,10,-13,w-20,h+2,'#b6c6c3');r(c,14,-9,w-28,h-6,'#cdd7cd');r(c,10,h-12,w-20,10,'#a7bdb6');r(c,0,h-4,17,4,'#687a70');r(c,w-17,h-4,17,4,'#687a70');break;}
 case 'sign':{r(c,8,15,4,19,'#735f4d');r(c,23,15,4,19,'#735f4d');box(0,-21,w,h+9,'#647f6e');r(c,5,-14,w-10,2,'#ece6c9');r(c,5,-7,w-13,2,'#ece6c9');r(c,5,2,w-10,2,'#c9d6b5');r(c,5,8,w-14,2,'#c9d6b5');break;}
 default:box(0,-6,w,h+6);break;
 case 'fountain':{e(c,w/2,h/2+3,w/2,h/2,'#738a82');e(c,w/2,h/2-3,w/2-2,h/2-3,'#c4ccba');e(c,w/2,h/2-5,w/2-10,h/2-12,'#82adb0');e(c,w/2,h/2-5,w/2-15,h/2-17,'#95bdba');e(c,w/2,h/2-5,16,9,'#b3bfb1');r(c,w/2-5,h/2-29,10,24,'#b3bfb1');e(c,w/2,h/2-30,15,6,'#d3d8c4');r(c,w/2-1,h/2-41,2,13,'#e1ece0');break;}
 }
}
function floor(c,x,y,k){const px=x*32,py=y*32,n=noise(x,y),q=(a,b,w,h,col)=>r(c,px+a,py+b,w,h,col);if(k==='grass'){q(0,0,32,32,n>.6?'#7f9f6d':n>.3?'#789969':'#85a474');q(4+Math.floor(n*17),5,2,3,'#a9bd8a');q(19,22+Math.floor(n*5),3,2,'#698c5e');if(n>.87){q(8,19,3,3,'#d3c898');q(10,21,2,2,'#eee0af');}return;}if(k==='wood'||k==='cafe'){q(0,0,32,32,k==='wood'?(n>.5?'#cda97a':'#d7b68a'):(n>.5?'#bf966c':'#c7a177'));for(let yy=0;yy<32;yy+=8){q(0,yy,32,1,'#ab865c');q(((y*4+yy/8)%2)*16,yy,1,8,'#ab865c');if(n>.4)q(5,yy+4,12,1,'#c5a680');}return;}if(k==='stone'||k==='studio'){q(0,0,32,32,k==='studio'?(n>.5?'#c6cfca':'#ced5cd'):(n>.5?'#d7d9c8':'#dce0cf'));q(0,0,32,1,'#acb6aa');q(0,0,1,32,'#acb6aa');q(2,2,29,1,'#edf0df');return;}if(k==='door'){q(0,0,32,32,'#d2af7c');for(let yy=0;yy<32;yy+=8)q(0,yy,32,1,'#b18f68');q(0,29,32,3,'#e7c995');return;}if(k==='wall'){q(0,0,32,32,'#b3b9a4');return;}q(0,0,32,32,k==='paving'?'#dad8c3':'#d6c9ad');q(0,0,32,1,'#b9b49b');q(0,0,1,32,'#b9b49b');q(2,2,27,1,'#eee6cb');q(16,(x+y)%2?0:16,1,16,'#c6bea5');if(n>.55)q(8,19,5,1,'#c3bba0');}
function tree(c,x,y,s=1){detailTree(c,x,y,s,x+y);}
function rug(c,x,y,w,h,col){r(c,x,y,w,h,col);r(c,x+4,y+4,w-8,2,'#e2d6b2');r(c,x+4,y+h-6,w-8,2,'#e2d6b2');r(c,x+4,y+4,2,h-8,'#e2d6b2');r(c,x+w-6,y+4,2,h-8,'#e2d6b2');for(let xx=x+9;xx<x+w-7;xx+=9){r(c,xx,y-3,3,3,'#c6b995');r(c,xx,y+h,3,3,'#c6b995');}}
function ground(c){c.imageSmoothingEnabled=false;for(let y=0;y<48;y++)for(let x=0;x<64;x++)floor(c,x,y,MAP_TILES[y][x]);for(let x=64;x<2048;x+=97){tree(c,x,58,.62);tree(c,x+12,1512,.65);}for(let y=190;y<1420;y+=110){tree(c,40,y,.65);tree(c,2012,y,.68);}for(const[x,y,s]of[[940,214,.76],[1100,350,.72],[940,515,.72],[1101,1120,.76],[940,1275,.72],[1100,1450,.6]])tree(c,x,y,s);for(const[x,y]of[[128,678],[848,678],[1175,678],[1902,678],[140,878],[850,878],[1172,878],[1888,878]]){r(c,x-10,y-4,20,5,'#7d8268');r(c,x-6,y-20,12,18,'#a6ad89');plant(c,x,y-17,.7);}rug(c,288,384,416,192,'#9aa78c');rug(c,416,1088,160,256,'#b5a487');rug(c,1472,1024,128,352,'#9baea9');for(const room of MAP_ROOMS)for(const[dx,dy]of room.doors)r(c,dx*32,dy*32+3,32,4,'#f1d19a');c.textAlign='center';c.font='bold 17px "Microsoft JhengHei", sans-serif';c.fillStyle='#687e62';c.fillText('日 和 步 道',1024,726);c.font='12px sans-serif';c.fillText('A LITTLE TOWN, EVERYDAY STORIES',1024,747);for(const o of MAP_OBJECTS)e(c,o.x+o.width/2+3,o.y+o.height-2,o.width/2+4,Math.min(12,o.height/4),'#53654b25');}
function wallLayers(scene){
 const layers=[],groups=new Map();for(const wall of MAP_WALLS){const key=`${wall.zone}:${wall.y}:${wall.edge}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(wall);}
 for(const[group,items]of groups){items.sort((a,b)=>a.x-b.x);const runs=[];for(const tile of items){const last=runs.at(-1);if(last&&last.at(-1).x+32===tile.x)last.push(tile);else runs.push([tile]);}
  for(const[index,run]of runs.entries()){const first=run[0],w=run.length*32,up=first.edge==='north'?40:first.edge==='south'?12:24,texture=cv(w,32+up),c=texture.getContext('2d');c.imageSmoothingEnabled=false;drawDetailedWall(c,w,up,first);const key=`town-wall-v6-${group}-${index}`;scene.textures.addCanvas(key,texture);layers.push({x:first.x,y:first.y-up,key,depth:first.y+32});}
 }return layers;
}
function nameplateLayers(scene){
 return MAP_ROOMS.map(room=>{
  const measure=cv(1,1).getContext('2d');measure.font='600 16px "Microsoft JhengHei", sans-serif';
  const width=Math.max(182,Math.ceil(measure.measureText(room.name).width)+38),texture=cv(width,37),c=texture.getContext('2d');c.imageSmoothingEnabled=false;
  r(c,2,3,width-2,34,'#253d3333');r(c,0,0,width,33,'#365d4b');r(c,2,2,width-4,29,'#456c55');r(c,3,2,width-6,1,'#93aa7c');r(c,3,30,width-6,1,'#233f36');r(c,7,8,2,2,'#c9be8b');r(c,width-9,8,2,2,'#c9be8b');
  c.textAlign='center';c.font=measure.font;c.fillStyle='#f3e8c5';c.fillText(room.name,width/2,20);c.font='7px sans-serif';c.fillStyle='#c4d0b1';c.fillText(room.subtitle,width/2,28);
  const key=`town-nameplate-v6-${room.zone}`;scene.textures.addCanvas(key,texture);return{x:(room.x+room.w/2)*32-width/2,y:room.y*32-42,key,depth:room.y*32+33};
 });
}
export {FURNITURE_ATLAS_KEY};
export function preloadTownAssets(scene){if(scene?.load&&!scene.textures.exists(FURNITURE_ATLAS_KEY))scene.load.image(FURNITURE_ATLAS_KEY,FURNITURE_ATLAS_URL);}
// Slice and trim each 256px atlas tile once. A tile that is not transparent (or an
// unexpectedly sized image) is rejected so that object keeps its code-drawn art.
function loadAtlas(scene){
 try{
  if(!scene.textures.exists(FURNITURE_ATLAS_KEY))return null;
  const image=scene.textures.get(FURNITURE_ATLAS_KEY).getSourceImage();
  if(!image||image.width<ATLAS_TILE*ATLAS_COLUMNS||image.height<ATLAS_TILE*ATLAS_ROWS)return null;
  const scratch=cv(ATLAS_TILE,ATLAS_TILE),c=scratch.getContext('2d',{willReadFrequently:true}),metrics=new Map();
  for(let row=0;row<ATLAS_ROWS;row++)for(let col=0;col<ATLAS_COLUMNS;col++){
   c.clearRect(0,0,ATLAS_TILE,ATLAS_TILE);c.drawImage(image,col*ATLAS_TILE,row*ATLAS_TILE,ATLAS_TILE,ATLAS_TILE,0,0,ATLAS_TILE,ATLAS_TILE);
   const bounds=alphaBounds(c.getImageData(0,0,ATLAS_TILE,ATLAS_TILE).data,ATLAS_TILE,ATLAS_TILE);
   if(bounds&&bounds.opaque<.8&&bounds.w>16&&bounds.h>16)metrics.set(`${row},${col}`,bounds);
  }
  return metrics.size?{image,metrics}:null;
 }catch{return null;}
}
function drawAtlasObject(scene,o,key,{image,metrics}){
 const recipe=atlasRecipe(o);if(!recipe)return false;
 const items=layoutSprites(o,recipe,tile=>metrics.get(tile));if(!items)return false;
 const texture=cv((o.width+32)*2,(o.height+96)*2),c=texture.getContext('2d');c.scale(2,2);c.translate(16,72);c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
 for(const item of items){const b=metrics.get(item.key);c.drawImage(image,item.col*ATLAS_TILE+b.x,item.row*ATLAS_TILE+b.y,b.w,b.h,item.dx,item.dy,item.dw,item.dh);}
 const added=scene.textures.addCanvas(key,texture);
 // Smooth downscaling suits the painted atlas; the code-drawn pixel art stays nearest-neighbour.
 try{const mode=globalThis.Phaser?.Textures?.FilterMode?.LINEAR;if(mode!==undefined)added?.setFilter(mode);}catch{/* Default filtering is acceptable. */}
 return true;
}
export function registerTownAssets(scene,agents){if(!scene.textures.exists(BACKGROUND_KEY)){const texture=cv(WORLD_SIZE.width,WORLD_SIZE.height);ground(texture.getContext('2d'));detailGround(texture.getContext('2d'),MAP_TILES,MAP_ROOMS);scene.textures.addCanvas(BACKGROUND_KEY,texture);}let foreground=scene.registry.get('town-art-foreground-v8');if(!foreground){foreground=[...wallLayers(scene),...nameplateLayers(scene)];const atlas=loadAtlas(scene);for(const o of MAP_OBJECTS){const depth=o.y+o.height+(o.passable?-18:0),key=`town-object-v8-${o.id}`;
  // Furniture from the bitmap atlas is rendered at 2x and shown at half scale; code-drawn art is the fallback.
  const sprites=atlas&&drawAtlasObject(scene,o,key,atlas);if(sprites){foreground.push({x:o.x-16,y:o.y-72,key,depth,scale:.5});continue;}
  const texture=cv(o.width+32,o.height+96),c=texture.getContext('2d');c.imageSmoothingEnabled=false;c.translate(16,72);furniture(c,o);detailFurniture(c,o);scene.textures.addCanvas(key,texture);foreground.push({x:o.x-16,y:o.y-72,key,depth});}scene.registry.set('town-art-foreground-v8',foreground);}return{backgroundKey:BACKGROUND_KEY,backgroundSize:WORLD_SIZE,foreground,ambient:{fountain:{x:208,y:749,radius:42},lamps:[{x:925,y:690},{x:1122,y:690},{x:925,y:873},{x:1122,y:873}]},equipmentLabels:{workshop:{x:1214,y:542},studio:{x:1214,y:1339}},zoneCenters:ZONE_CENTERS,...registerResidentAssets(scene,agents)};}
