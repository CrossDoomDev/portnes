import { actorFromColumns, actorColumns } from "../src/actors.js";
export function cameraInputs(seed) {
  let value = seed;
  const random = () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value >>> 24;
  };
  return function next(index) {
    return {
      actors: Array.from({ length: 32 }, (_, slot) => {
        const actor = actorFromColumns(Array.from({ length: 3 }, () =>
          Array.from({ length: 8 }, random)));
        if ((slot + index) % 4 === 0) actor.y = 255;
        return actor;
      }),
      cells: Array.from({ length: 480 }, random),
      state: {
        cameraLow: random(), cameraHigh: random(), cameraFineY: index % 240,
        worldPage: ((random() << 8) | random()), mode: random(), equipment: random(),
      },
      horizontal: random(), vertical: random(),
    };
  };
}
export function cameraOutput(input, events) {
  const s = input.state;
  return [
    ...input.actors.flatMap(a => actorColumns(a).flat()), ...input.cache.cells,
    s.cameraLow, s.cameraHigh, s.cameraFineY, s.worldPage & 255, s.worldPage >> 8,
    s.mode, s.equipment,
    events.length, ...events.flatMap(e => e),
  ];
}
