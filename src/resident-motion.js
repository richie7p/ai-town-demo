// Display-only atlas contract. No clip changes the research world.
export const RESIDENT_FRAME_COUNT = 192;
const descriptor = (start, end, frameRate, repeat = -1, repeatDelay = 0) =>
  Object.freeze({ start, end, frameRate, repeat, repeatDelay });
const clips = {};
const directions = ['down', 'left', 'right', 'up'];
for (const [index, direction] of directions.entries()) {
  clips[direction] = descriptor(48 + index * 8, 55 + index * 8, 10);
  clips[`sit-${direction}`] = descriptor(80 + index * 4, 83 + index * 4, 8, 0);
  clips[`rest-${direction}`] = descriptor(96 + index * 4, 99 + index * 4, 2.5, -1, 650);
  clips[`talk-${direction}`] = descriptor(112 + index * 8, 119 + index * 8, 6, -1, 900);
  clips[`idle-${direction}`] = descriptor(176 + index * 4, 179 + index * 4, 4, -1, 2600);
}
clips.work = clips['work-down'] = descriptor(144, 151, 7, -1, 450);
clips['work-up'] = descriptor(152, 159, 7, -1, 450);
clips.camera = clips['camera-down'] = descriptor(160, 167, 5, -1, 800);
clips['camera-up'] = descriptor(168, 175, 5, -1, 800);
clips.talk = clips['talk-down'];
clips.rest = clips['rest-down'];
export const RESIDENT_CLIPS = Object.freeze(clips);
