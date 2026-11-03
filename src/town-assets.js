import { registerResidentAssets } from './resident-art.js';
import { WORLD_SIZE, ZONE_CENTERS } from './town-view-model.js';

const BACKGROUND_KEY='town-grand-landscape-v1';
// The environment is a generated visual asset. Buildings and props introduce
// no extra agents, research resources, capacity, or interaction rules.
export function preloadTownAssets(scene){
  // Load same-origin images directly; no blob URL or broader image CSP needed.
  scene.load.imageLoadType='HTMLImageElement';
  if(!scene.textures.exists(BACKGROUND_KEY))scene.load.image(BACKGROUND_KEY,'/assets/town-grand-v1.png');
}
export function registerTownAssets(scene,agents){
  const residents=registerResidentAssets(scene,agents);
  return {
    backgroundKey:BACKGROUND_KEY,
    backgroundSize:WORLD_SIZE,
    foreground:[],
    ambient:{
      fountain:{x:712,y:1054},
      lamps:[
        {x:1145,y:531},{x:1264,y:531},{x:1145,y:844},{x:1264,y:844},
        {x:158,y:525},{x:2162,y:722},{x:179,y:944},{x:1639,y:817},
        {x:1145,y:1153},{x:1264,y:1153},{x:2195,y:1228},
      ],
    },
    equipmentLabels:{workshop:{x:1530,y:637},studio:{x:1610,y:1360}},
    zoneCenters:ZONE_CENTERS,
    ...residents,
  };
}
