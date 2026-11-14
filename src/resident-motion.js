// The resident atlas layout: which of the 192 frames each animation uses.
// Display-only; no clip changes the research world.
//
// Frames 0–47 are the original single poses; the clips below were added after them.
export const RESIDENT_FRAME_COUNT = 192;
export const RESIDENT_DIRECTIONS = Object.freeze(['down', 'left', 'right', 'up']);

const clip = (start, end, frameRate, repeat = -1, repeatDelay = 0) =>
  Object.freeze({ start, end, frameRate, repeat, repeatDelay });

const clips = {};
for (const [index, direction] of RESIDENT_DIRECTIONS.entries()) {
  clips[direction] = clip(48 + index * 8, 55 + index * 8, 10); // walk, 8 phases
  clips[`sit-${direction}`] = clip(80 + index * 4, 83 + index * 4, 8, 0); // sit down once
  clips[`rest-${direction}`] = clip(96 + index * 4, 99 + index * 4, 2.5, -1, 650);
  clips[`talk-${direction}`] = clip(112 + index * 8, 119 + index * 8, 6, -1, 900);
  clips[`idle-${direction}`] = clip(176 + index * 4, 179 + index * 4, 4, -1, 2600);
}
// Work and camera poses only face down (towards the viewer) or up (towards a table).
clips.work = clips['work-down'] = clip(144, 151, 7, -1, 450);
clips['work-up'] = clip(152, 159, 7, -1, 450);
clips.camera = clips['camera-down'] = clip(160, 167, 5, -1, 800);
clips['camera-up'] = clip(168, 175, 5, -1, 800);
clips.talk = clips['talk-down'];
clips.rest = clips['rest-down'];

export const RESIDENT_CLIPS = Object.freeze(clips);
