import {
  byte,
  motionDelta,
  moveActor,
  turnStep,
  ACTOR_FRAME_ENDED,
} from "./actors.js";
const actions = [
  "face",
  "move",
  "wait",
  "jump",
  "switchAI",
  "fallbackAI",
  "branchRange",
  "triggerRange",
  "aimFire",
  "speed",
];
const requireOperation = (operations, name) => {
  if (typeof operations[name] !== "function")
    throw Error(`Unported script dependency: ${name}`);
  return operations[name];
};
const setCursor = (actor, id) => {
  actor.commandId = id;
  const address = id ? parseInt(id.slice(4), 16) : 0;
  actor.scriptLow = address & 255;
  actor.scriptHigh = address >> 8;
};
export function createScriptRunner(graph, motionData, operations = {}) {
  return function updateScript(actor, slot, frameCounter) {
    let abort = false;
    if (actor.timer === 0) {
      let decoded = false;
      for (let guard = 0; guard < 256 && !decoded; guard++) {
        const node = graph[actor.commandId];
        if (!node)
          throw Error(`Unknown native actor command ${actor.commandId}`);
        actor.kind = actions.indexOf(node.action);
        actor.currentAction = node.action;
        switch (node.action) {
          case "face":
            actor.turnTarget = node.value * 2;
            if (turnStep(actor.heading, actor.turnTarget) === 0)
              actor.turnTarget = 255;
            actor.timer = 255;
            setCursor(actor, node.next);
            if (actor.flags & 8) {
              actor.heading = node.value;
              actor.turnTarget = 255;
            }
            decoded = true;
            break;
          case "move":
            actor.timer = byte(node.value << 4);
            setCursor(actor, node.next);
            decoded = true;
            break;
          case "wait":
            actor.counter = byte(node.value << 4);
            setCursor(actor, node.next);
            decoded = true;
            break;
          case "jump":
            setCursor(actor, node.target);
            break;
          case "switchAI":
            actor.scriptLow = 0;
            actor.scriptHigh = 0;
            actor.commandId = null;
            actor.pendingKind = 0;
            actor.kind = node.kind;
            abort = true;
            decoded = true;
            break;
          case "fallbackAI":
            actor.pendingKind = node.kind;
            setCursor(actor, node.next);
            break;
          case "branchRange": {
            const relative = requireOperation(operations, "relativeToPlayer")(
              actor,
              slot,
            );
            setCursor(
              actor,
              node.value >= relative.range ? node.next : node.target,
            );
            break;
          }
          case "triggerRange":
            actor.rangeThreshold = node.value;
            setCursor(actor, node.next);
            break;
          case "aimFire":
            actor.counter = node.value;
            actor.timer = 2;
            setCursor(actor, node.next);
            decoded = true;
            break;
          case "speed":
            actor.flags = (actor.flags & 240) | node.value;
            setCursor(actor, node.next);
            break;
          default:
            throw Error(`Unported script action ${node.action}`);
        }
        if (guard === 255 && !decoded)
          throw Error("Nonterminating actor script");
      }
    }
    if (abort) return ACTOR_FRAME_ENDED;
    actor.timer = byte(actor.timer - 1);
    // A resumed actor may have a nonzero timer without JS-only metadata.
    actor.currentAction = actions[actor.kind];
    switch (actor.currentAction) {
      case "face":
        if (actor.turnTarget !== 255) {
          actor.timer = byte(actor.timer + 1);
          actor.timer = byte(actor.timer - 1);
          if ((actor.timer & 7) === 0) {
            const delta = turnStep(actor.heading, actor.turnTarget);
            actor.heading = (actor.heading + delta) & 7;
            if (delta === 0) actor.turnTarget = 255;
          }
        } else actor.timer = 0;
        break;
      case "move": {
        const delta = motionDelta(
          motionData,
          actor.flags & 15,
          actor.heading,
          actor.timer,
        );
        moveActor(actor, delta.dx, delta.dy);
        requireOperation(operations, "collideMovement")(actor, slot, delta);
        if ((actor.flags & 15) === 14) {
          if ((actor.timer & 7) === 0)
            requireOperation(operations, "fire")(actor, slot);
          if (byte(actor.contactFlags << 1) !== 0) actor.y = 255;
        }
        break;
      }
      case "wait":
        actor.timer = 2;
        actor.counter = byte(actor.counter - 1);
        if (actor.counter === 0) actor.timer = 0;
        break;
      case "aimFire":
        if (actor.timer === 1) {
          const relative = requireOperation(operations, "relativeToPlayer")(
            actor,
            slot,
          );
          const jitter = [-1, 0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 0, 1, 0, 0, 0][
            ((slot * 16 + frameCounter) & 255) >> 4
          ];
          actor.heading = ((relative.directionFine + jitter) >> 1) & 7;
          const pending = actor.pendingKind;
          actor.pendingKind = actor.parameter2;
          requireOperation(operations, "fire")(actor, slot);
          actor.pendingKind = pending;
          actor.counter = byte(actor.counter - 1);
          if (actor.counter === 0) {
            actor.heading = pending & 7;
            actor.timer = 0;
          }
        }
        break;
      default:
        throw Error(`Unported blocking script action ${actor.currentAction}`);
    }
    if (((slot + frameCounter) & 1) === 0 && actor.rangeThreshold !== 0) {
      const relative = requireOperation(operations, "relativeToPlayer")(
        actor,
        slot,
      );
      if (relative.range < actor.rangeThreshold && actor.pendingKind !== 255) {
        actor.heading = relative.directionFine >> 1;
        actor.kind = actor.pendingKind;
        actor.rangeThreshold = 0;
        actor.pendingKind = 0;
        actor.scriptLow = 0;
        actor.scriptHigh = 0;
        actor.commandId = null;
        actor.timer = 1;
        actor.turnTarget = 255;
      }
    }
  };
}
