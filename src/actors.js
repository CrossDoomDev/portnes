// Independently executable native JavaScript domain helpers. No ROM/CPU/PPU imports.
// Data is normalized by extract.mjs during research, not loaded from a cartridge at runtime.
export const byte = (value) => value & 255;
export function motionDelta(data, speedMode, heading, phase) {
  if (speedMode < 0 || speedMode >= 15)
    throw Error("Reserved motion mode is not ported");
  const packed = data.motion[speedMode][((heading << 3) | (phase & 7)) & 255];
  const signed = (n) => (n < 8 ? n : n - 16);
  return { dy: signed(packed >> 4), dx: signed(packed & 15) };
}
export const ACTOR_FIELDS = [
  ["xLow", "xHigh", "y", "appearance", "counter", "style", "flags", "heading"],
  [
    "rangeThreshold",
    "pendingKind",
    "turnTarget",
    "kind",
    "contactFlags",
    "link",
    "counter2",
    "timer",
  ],
  [
    "scriptLow",
    "scriptHigh",
    "parameter2",
    "projectileKind",
    "hitbox",
    "deathEffect",
    "dropId",
    "spawnMarker",
  ],
];
const fields = ACTOR_FIELDS;
export function actorFromColumns(columns) {
  const actor = {};
  fields.forEach((names, g) =>
    names.forEach((name, i) => (actor[name] = columns[g][i])),
  );
  return actor;
}
export function actorColumns(actor) {
  return fields.map((names) => names.map((name) => actor[name] ?? 0));
}
export function applyPrototype(data, actor, prototypeId) {
  const prototype = data.prototypes[prototypeId];
  if (!prototype) throw Error(`Unresolved actor prototype ${prototypeId}`);
  const old = { xLow: actor.xLow, xHigh: actor.xHigh, y: actor.y };
  prototype.fields.forEach((values, g) =>
    values.forEach((value, i) => {
      if (value !== null) actor[fields[g][i]] = value;
    }),
  );
  if (prototype.relativePosition) {
    const x = old.xLow + actor.xLow;
    actor.xLow = x & 255;
    actor.xHigh = (old.xHigh + actor.xHigh + (x >> 8)) & 255;
    actor.y = (old.y + actor.y) & 255;
  }
  return actor;
}
export function moveActor(actor, dx, dy) {
  actor.y = (actor.y + dy) & 255;
  const x = actor.xLow + dx;
  actor.xLow = x & 255;
  actor.xHigh = (actor.xHigh + (x < 0 ? -1 : x > 255 ? 1 : 0)) & 255;
}
export function bounds(data, actor, cameraLow = 0) {
  const offsets = data.hitboxes[actor.hitbox & 15];
  const x = (actor.xLow - cameraLow) & 255;
  return offsets.map((v, i) => ((i < 2 ? x : actor.y) + v) & 255);
}
export function intersects(data, a, b, cameraLow = 0) {
  const [l, r, t, bottom] = bounds(data, a, cameraLow),
    [bl, br, bt, bb] = bounds(data, b, cameraLow);
  return br >= l && bl < r && bb >= t && bt < bottom;
}
export function turnStep(heading, desiredFineDirection) {
  const diff = (heading - (desiredFineDirection >> 1)) & 7;
  return [0, -1, -1, -1, -1, 1, 1, 1][diff];
}
export function reserveSlot(actors, startOffset, count) {
  for (let slot = startOffset >> 3; count > 0; slot++, count--)
    if (actors[slot].y === 255) return slot;
  return -1;
}
export const VERIFIED_HANDLERS = Object.freeze({ d0c6: () => {} });
export const ACTOR_FRAME_ENDED = Symbol("Actor script ended this update pass");
export class UnportedActorError extends Error {
  constructor(kind, entry) {
    super(
      `Native actor kind ${kind} (original handler $${entry}) is not ported`,
    );
    this.kind = kind;
    this.entry = entry;
  }
}
export function updateActors(
  actors,
  frameCounter,
  dispatch,
  handlers,
  updateScript,
  onFrameCounterChange,
  beforeHandler,
) {
  for (let slot = 0; slot < 30; slot++) {
    const actor = actors[slot];
    if (actor.y >= 232) {
      actor.y = 255;
      continue;
    }
    if (actor.scriptHigh & 128) {
      if (updateScript(actor, slot, frameCounter) === ACTOR_FRAME_ENDED) return;
      continue;
    }
    const entry = dispatch[actor.kind],
      handler = handlers[entry];
    if (!handler) throw new UnportedActorError(actor.kind, entry);
    beforeHandler?.(actor, slot);
    const result = handler(actor, slot, frameCounter);
    if (Number.isInteger(result?.frameCounter)) {
      frameCounter = result.frameCounter & 255;
      onFrameCounterChange?.(frameCounter);
    }
  }
}
