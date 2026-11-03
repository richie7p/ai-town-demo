// Presentation geometry only. These positions never determine interaction
// eligibility, movement duration, equipment use, or any V5 research outcome.
export const WORLD_SIZE = Object.freeze({ width: 1000, height: 650 });
const slots = {
  home: [[95,236],[172,250],[252,234],[335,253],[404,233],[124,283],[246,281],[369,285]],
  workshop: [[583,236],[659,249],[737,233],[816,253],[907,233],[602,283],[744,281],[879,284]],
  plaza: [[104,421],[198,410],[310,417],[397,454],[372,549],[282,580],[156,575],[91,514]],
  studio: [[585,421],[596,506],[687,528],[786,530],[906,507],[613,582],[748,584],[887,581]],
};
const doors = { home:[430,274], workshop:[570,274], plaza:[430,397], studio:[570,397] };
const utteranceKinds = new Set(['talk','reply','invite','accept','decline']);
const failureKinds = new Set(['invalid','capacity_failure','join_failed']);
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
export const clampZoom = value => clamp(Number.isFinite(value) ? value : 1,1,2.5);

export function isContinuousFrame(previous,next) {
  return !!previous && next.tick === previous.tick+1 && next.config.seed===previous.config.seed && next.config.capacity===previous.config.capacity;
}
export function characterPosition(agent,frame) {
  const index=Math.max(0,frame.agents.findIndex(a=>a.id===agent.id));
  const base=slots[agent.zone]?.[index%8] ?? [500,340];
  const proposal=frame.trace?.proposals.find(p=>p.actor===agent.id);
  const walking=proposal?.action==='walk' && frame.events.some(e=>e.tick===frame.tick && e.proposalId===proposal.id && e.success===true);
  return [base[0]+(walking ? (frame.tick%2 ? 12 : -12) : 0),base[1]+(walking ? (index%2 ? 5 : -5) : 0)];
}
export function presentationPath(from,to,oldZone,newZone) {
  if(oldZone===newZone)return [from.slice(),to.slice()];
  const a=doors[oldZone]??[500,340],b=doors[newZone]??[500,340];
  const exit=(point,zone)=>{
    if(zone==='home'||zone==='workshop')return [point,[point[0],274],doors[zone]];
    if(zone==='plaza'){const lane=point[0]<190?85:422;return [point,[lane,point[1]],[lane,397],doors[zone]];}
    if(zone==='studio')return [point,[point[0],571],[600,571],[600,397],doors[zone]];
    return [point,[500,340]];
  };
  return [...exit(from,oldZone),[500,a[1]],[500,b[1]],...exit(to,newZone).reverse()].map(p=>p.slice());
}
export function samplePath(path,progress) {
  if(!path.length)return [500,340];
  const ratio=clamp(Number.isFinite(progress)?progress:1,0,1);
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
