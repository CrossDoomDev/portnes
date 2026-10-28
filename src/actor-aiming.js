import { byte } from "./actors.js";

/** Original quantized direction/range calculation. This is deliberately integer
 * arithmetic, including its unsigned vertical-overflow behavior. */
export function sampleRelativeToActor(
  data,
  actor,
  target,
  targetSlot,
  frameCounter,
  status = {},
) {
  if (target.y === 255)
    return {
      directionFine: 0,
      range: 15,
      steering: status.inactiveSteering,
      routing: status.inactiveRoute,
    };
  const dx =
    ((target.xHigh << 8) | target.xLow) - ((actor.xHigh << 8) | actor.xLow);
  const column = ((dx >> 4) + 16) & 31;
  let targetY = byte(target.y - 8);
  if (targetSlot === 1)
    targetY = byte(targetY + (frameCounter & 128 ? -32 : 32));
  const difference = targetY - actor.y;
  let dy = byte(difference);
  const overflow = difference < -128 || difference > 127;
  if (overflow) dy ^= 255;
  const cell = data.grid[dy >> 4][column];
  if (overflow)
    return {
      directionFine: cell.directionFine,
      range: 7,
      steering: cell.steering,
      routing: cell.routing,
    };
  if (status.equipment & 16 && status.modifiers & 1 && frameCounter < 192)
    return {
      directionFine: cell.directionFine ^ 15,
      range: 7,
      steering: cell.steering,
      routing: cell.routing,
    };
  return {
    directionFine: cell.directionFine,
    range: cell.range,
    steering: cell.steering,
    routing: cell.routing,
  };
}

export function relativeToActor(...args) {
  const { directionFine, range } = sampleRelativeToActor(...args);
  return { directionFine, range };
}
