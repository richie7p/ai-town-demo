import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/engine.js';
import { viewFrame } from '../src/presentation.js';
import { activityAnchor } from '../src/town-map.js';
import { characterPresentation } from '../src/town-view-model.js';
import { RESIDENT_CLIPS, RESIDENT_FRAME_COUNT } from '../src/resident-motion.js';
import { seatedPose, walkDuration } from '../src/character-motion.js';

test('all directions have eight walking phases and complete non-looping sit clips inside the atlas',()=>{
  for(const direction of ['down','left','right','up']){
    assert.equal(RESIDENT_CLIPS[direction].end-RESIDENT_CLIPS[direction].start+1,8);
    assert.equal(RESIDENT_CLIPS[`sit-${direction}`].repeat,0);
    assert.ok(RESIDENT_CLIPS[`talk-${direction}`].repeatDelay>=800);
    for(const kind of ['sit','rest','talk','idle'])assert.ok(RESIDENT_CLIPS[`${kind}-${direction}`]);
  }
  for(const clip of Object.values(RESIDENT_CLIPS))assert.ok(clip.start>=0&&clip.end<RESIDENT_FRAME_COUNT&&clip.start<=clip.end);
});

test('a rejected equipment action while seated preserves sitting without showing equipment use',()=>{
  const world=createWorld();world.agents.forEach(a=>a.zone='home');
  const rested=step(world,[{actor:'A01',action:'rest'}]);
  const rejected=viewFrame(step(rested,[{actor:'A01',action:'borrow',resourceType:'tools'}]));
  const presentation=characterPresentation(rejected,'A01'),anchor=activityAnchor(rejected.agents.find(a=>a.id==='A01'),rejected);
  assert.equal(presentation.failed,true);
  assert.equal(anchor.seated,true);
  assert.equal(seatedPose(presentation,anchor),'rest');
  assert.equal(presentation.held,null);
});

test('long walks get travel time proportional to distance and respect the chosen playback speed',()=>{
  const room=walkDuration(270,1620),crossTown=walkDuration(1080,1620);
  assert.equal(crossTown/room,4);
  assert.ok(crossTown>6000,'cross-town movement must not be squeezed into one short step');
  assert.equal(walkDuration(1080,405),crossTown/4);
});
