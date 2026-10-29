import { byte } from "./actors.js";

/** Logical layout/culling state retained for gameplay and RNG. These tokens
 * are never rendered; the HTML5 renderer draws its own actors and artwork.
 * Keeping this separate makes changes to the new art independent of combat.
 */
export function createLayoutState(data, actors, state) {
  if (data?.schema !== 1) throw Error("Unsupported logical layout schema");
  const parts = state.layoutParts ?? Array.from({ length: 64 }, () =>
    ({ y: 248, token: 255, layer: 0, x: 0 }));
  state.layoutParts = parts;
  function update(frame) {
    const order = frame & 1
      ? [16, 15, 14, 19, 18, 17, 0, 1, ...Array.from({ length: 12 }, (_, i) => 31 - i), ...Array.from({ length: 12 }, (_, i) => 13 - i)]
      : [...Array.from({ length: 6 }, (_, i) => 14 + i), ...Array.from({ length: 14 }, (_, i) => i), ...Array.from({ length: 12 }, (_, i) => 20 + i)];
    let cursor = 1;
    for (const slot of order) {
      const actor = slot < 30 ? actors[slot] : state.reservedActors?.[slot - 30];
      if (!actor) throw Error("Logical layout requires reserved scene records");
      if (actor.y === 255) continue;
      if (cursor === 64) break;
      const distance = state.mode & 128
        ? (actor.xHigh & 1) * 256 + actor.xLow
        : (((actor.xHigh << 8) | actor.xLow) - ((state.cameraHigh << 8) | state.cameraLow)) & 511;
      actor.xHigh = (actor.xHigh & 127) | (distance >= 256 ? 128 : 0);
      if (actor.xHigh & 128) continue;
      const id = byte(actor.appearance + (actor.flags & 128 ? 0 : actor.heading));
      const groups = data.entries[id];
      if (!groups) throw Error(`Unknown logical appearance ${id}`);
      for (const group of groups) {
        const phase = (actor.timer & group.phaseMask) >> group.phaseShift;
        state.drawContact = (actor.contactFlags & 128) >> 2;
        for (const part of group.parts) {
          const variant = part.variants[phase], record = parts[cursor];
          record.token = 255;
          const x = (distance & 255) + variant.dx;
          record.x = byte(x);
          const xFits = variant.dx < 128 ? x < 256 : x >= 256;
          let fits = xFits;
          if (fits) {
            const y = actor.y + variant.dy;
            record.y = byte(y);
            fits = variant.dy < 128 ? y < 256 : y >= 256;
          }
          if (!fits) record.y = 248;
          else {
            record.layer = byte(variant.layer + (actor.style & 3) + state.drawContact);
            record.token = byte(part.token + (actor.style >> 2) + group.styleOffset + variant.tokenDelta);
            cursor++;
            if (cursor === 64) return parts;
          }
        }
      }
    }
    for (; cursor < 64; cursor++) parts[cursor].y = 248;
    return parts;
  }
  return { update, parts };
}
