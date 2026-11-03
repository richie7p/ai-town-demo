// Presentation geometry only. These positions never determine interaction
// eligibility, movement duration, equipment use, or any V5 research outcome.
export const WORLD_SIZE = Object.freeze({ width: 2400, height: 1600 });
export const ZONE_CENTERS = Object.freeze({
  home: Object.freeze([610,420]),
  workshop: Object.freeze([1800,430]),
  plaza: Object.freeze([600,1190]),
  studio: Object.freeze([1800,1190]),
});
const slots = {
  home: [[210,545],[330,560],[450,548],[570,563],[690,545],[810,560],[930,548],[1050,560]],
  workshop: [[1350,550],[1460,563],[1570,545],[1680,560],[1790,548],[1900,563],[2010,546],[2120,560]],
  plaza: [[448,1053],[712,906],[977,1053],[712,1194],[250,1288],[455,1300],[935,1286],[1060,1300]],
  studio: [[1340,1288],[1450,1301],[1560,1286],[1670,1300],[1780,1288],[1890,1301],[2000,1286],[2110,1300]],
};
// Pixel positions follow the visible streets in the illustrated town map. The square's
// ring uses the outer stone walk, then its southern stairs; no path crosses water.
const streetY = { home:550, workshop:550, plaza:1290, studio:1290 };
const crossing = [1200,744];
const fountainRing = [[712,906],[873,942],[977,1053],[903,1150],[712,1194],[533,1152],[448,1053],[525,953]];
const utteranceKinds = new Set(['talk','reply','invite','accept','decline']);
const failureKinds = new Set(['invalid','capacity_failure','join_failed']);
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
export const clampZoom = value => clamp(Number.isFinite(value) ? value : 1,1,3.5);

export function isContinuousFrame(previous,next) {
  return !!previous && next.tick === previous.tick+1 && next.config.seed===previous.config.seed && next.config.capacity===previous.config.capacity;
}
export function characterPosition(agent,frame) {
  const index=Math.max(0,frame.agents.findIndex(a=>a.id===agent.id));
  const base=slots[agent.zone]?.[index%8] ?? crossing;
  const proposal=frame.trace?.proposals.find(p=>p.actor===agent.id);
  const walking=proposal?.action==='walk' && frame.events.some(e=>e.tick===frame.tick && e.proposalId===proposal.id && e.success===true);
  return [base[0]+(walking ? (frame.tick%2 ? 18 : -18) : 0),base[1]+(walking ? (index%2 ? 7 : -7) : 0)];
}
export function presentationPath(from,to,oldZone,newZone) {
  if(oldZone===newZone)return [from.slice(),to.slice()];
  const exit=(point,zone)=>{
    const lane=streetY[zone];
    if(lane===undefined)return [point,crossing];
    if(zone==='plaza'&&point[1]<1230){
      const nearest=fountainRing.map((p,index)=>({index,distance:Math.hypot(point[0]-p[0],point[1]-p[1])})).sort((a,b)=>a.distance-b.distance)[0].index;
      const ringWalk=[];
      // The shorter perimeter route leads to the southern staircase (node 4).
      const direction=nearest<=4?1:-1;
      for(let index=nearest;;index+=direction){ringWalk.push(fountainRing[index]);if(index===4)break;}
      return [point,...ringWalk,[712,lane],[1200,lane]];
    }
    return [point,[point[0],lane],[1200,lane]];
  };
  const crossesMainStreet=streetY[oldZone]!==streetY[newZone];
  return [...exit(from,oldZone),...(crossesMainStreet?[crossing]:[]),...exit(to,newZone).reverse()]
    .filter((point,index,all)=>index===0||point[0]!==all[index-1][0]||point[1]!==all[index-1][1]).map(point=>point.slice());
}
export function samplePath(path,progress) {
  if(!path.length)return crossing.slice();
  const ratio=clamp(Number.isFinite(progress)?progress:1,0,1);
  if(ratio===0)return path[0].slice();
  if(ratio===1)return path.at(-1).slice();
  const lengths=path.slice(1).map((p,i)=>Math.hypot(p[0]-path[i][0],p[1]-path[i][1]));
  let distance=lengths.reduce((a,b)=>a+b,0)*ratio;
  for(let i=0;i<lengths.length;i++){
    if(distance<=lengths[i]){const t=lengths[i]?distance/lengths[i]:1;return [path[i][0]+(path[i+1][0]-path[i][0])*t,path[i][1]+(path[i+1][1]-path[i][1])*t];}
    distance-=lengths[i];
  }
  return path.at(-1).slice();
}
export function directionBetween(from,to,fallback='down') {
  const dx=to[0]-from[0],dy=to[1]-from[1];
  if(Math.hypot(dx,dy)<.1)return fallback;
  return Math.abs(dx)>Math.abs(dy) ? (dx<0?'left':'right') : (dy<0?'up':'down');
}
export function characterPresentation(frame,id) {
  const proposal=frame.trace?.proposals.find(p=>p.actor===id);
  const events=frame.events.filter(e=>e.tick===frame.tick);
  const results=proposal ? events.filter(e=>e.proposalId===proposal.id) : [];
  const failed=results.some(e=>failureKinds.has(e.type)||e.success===false);
  const delivered=results.find(e=>e.success===true && utteranceKinds.has(e.type));
  const work=results.find(e=>e.success===true && ['work','join'].includes(e.type));
  const rest=results.some(e=>e.success===true && ['rest','wait'].includes(e.type));
  const held=frame.equipment.find(e=>e.owner===id)??null;
  const workEquipment=work?.equipmentId || (work?.invitationId && events.find(e=>e.type==='work'&&e.invitationId===work.invitationId)?.equipmentId);
  let pose='idle';
  if(!failed){
    if(work)pose=workEquipment?.startsWith('camera') || held?.type==='camera' ? 'camera' : 'work';
    else if(rest)pose='rest';
    else if(delivered)pose='talk';
  }
  return {proposal,failed,delivered,pose,held,target:delivered?.participants.find(p=>p!==id)??null};
}
export function visibleUtterances(frame,selected,limit=3) {
  const seen=new Set();
  return frame.events.filter(e=>e.tick===frame.tick && utteranceKinds.has(e.type) && e.success===true && e.text)
    .sort((a,b)=>Number(b.participants[0]===selected)-Number(a.participants[0]===selected))
    .filter(e=>{const id=e.participants[0];if(seen.has(id))return false;seen.add(id);return true;}).slice(0,Math.max(0,limit));
}
