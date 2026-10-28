import { contactFor } from "./locomotion-inputs.mjs";
export function configureEmplacement(input, index, entry) {
  const { actor, actors, state } = input;
  actor.link = [0, 1, 2, 7, 14][index % 5];
  actor.counter = index % 4;
  actor.turnTarget = [0, 1, 15, 16, 31, 192, 223, 224, 255][index % 9];
  if (entry === "dff3")
    actors[actor.link].pendingKind = index % 3 === 0 ? 224 : 0;
  if (entry === "d6ab") {
    actor.link = index % 3;
    if (index & 1) actors[3].kind = 16;
  }
  if (entry === "e655") actor.scriptLow = [0, 1, 16, 17, 128, 255][index % 6];
  if (entry === "d386") {
    actor.counter = index % 3;
    actor.timer = index & 1 ? 1 : 0;
    actor.counter2 = index % 4;
  }
  state.mode = index & 255;
  state.musicCommand = 0;
  input.forcedFlags = [0, 128, 1, 64, 129][index % 5];
  return input;
}
export function emplacementOperations(input) {
  return {
    resolveContact(actor, slot, delta) {
      const flags = delta.forced
        ? input.forcedFlags
        : contactFor(actor, delta, input.profile);
      actor.contactFlags = flags;
      if (flags & 127) delta.dx = delta.dy = 0;
    },
    sampleContact(actor) {
      actor.contactFlags = input.forcedFlags;
    },
  };
}
