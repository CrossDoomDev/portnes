import { byte, motionDelta, turnStep, moveActor } from "./actors.js";
import { OriginalControls, turnToward } from "./player.js";
import { createActorLocomotion } from "./actor-locomotion.js";

/** BD40 camera routing, expressed in world/screen coordinates. */
export function routePlayerMovement(player, delta, state) {
  let screenDx = delta.dx;
  if (state.mode & 128) {
    if (byte(delta.dy + player.y + 64) < 96 || byte(delta.dx + player.xLow) >= 232) {
      delta.dx = delta.dy = screenDx = state.scrollX = state.scrollY = 0;
    }
  } else {
    if (byte(delta.dy + player.y + 64) < 176) {
      state.scrollY = byte(delta.dy);
      delta.dy = 0;
      if (!(state.scrollY & 128) || state.mode & 64) {
        if ((state.scrollY & 128) && (state.mode & 64)) state.scrollY = 0;
        delta.dx = screenDx = state.scrollX = 0;
      }
    }
    if (byte(delta.dx + state.playerScreenX + 104) < 188) {
      state.scrollX = byte(delta.dx);
      screenDx = 0;
    }
  }
  return screenDx;
}

/** CE5D/CE70 player update using the real two actor records and motion table.
 * This shares contact, projectile, inventory and scene state with the campaign.
 */
export function createPlayerController(data, actors, state, effects, weapons, operations) {
  const controls = new OriginalControls(state.controls);
  const locomotion = createActorLocomotion(data, effects, operations);
  const hull = () => actors[1];
  const probe = () => locomotion.probe(hull(), 1);
  function turn(target) { actors[0].heading = turnToward(actors[0].heading, target); }
  function tickHull(target) {
    const actor = hull();
    actor.timer = byte(actor.timer - 1);
    if (!(actor.timer & 3)) actor.heading = turnToward(actor.heading, target);
  }
  function update(mask) {
    const input = controls.sample(mask), body = actors[0], actor = hull();
    state.mode = (state.mode & 192) | ((input.triggered & 48) >> 4);
    if (input.triggered & 128) {
      if (!(state.modifiers & 1)) state.playerShotSucceeded = weapons.cannon() >= 0;
      if (state.playerShotSucceeded) body.timer = 16;
    }
    if (input.triggered & 64) weapons.machineGun();
    if (body.timer) body.timer = byte(body.timer - 1);
    let target = input.target;
    if (target !== 255) {
      if (input.triggered & 64) turn(target);
      if (turnStep(actor.heading, target) !== 0) {
        const saved = actor.heading;
        actor.heading = target >> 1;
        const blocked = probe();
        const next = actor.heading * 2;
        actor.heading = saved;
        if (blocked) {
          state.patience = byte(state.patience - 1);
          if (!state.patience) { state.patience = 1; tickHull(next); return input; }
        } else {
          state.patience = 20;
          target = next;
          if (turnStep(actor.heading, target) !== 0) {
            actor.timer = byte(actor.timer - 1);
            if (!(actor.timer & 3)) actor.heading = turnToward(actor.heading, target);
            return input;
          }
        }
      }
      actor.timer = byte(actor.timer - 1);
      if (!probe()) {
        const delta = motionDelta(data, actor.flags & 15, actor.heading, actor.timer);
        operations.resolveContact(actor, 1, delta);
        const screenDx = routePlayerMovement(body, delta, state);
        moveActor(actor, delta.dx, delta.dy);
        body.xLow = actor.xLow; body.xHigh = actor.xHigh; body.y = actor.y;
        state.playerScreenX = byte(state.playerScreenX + screenDx);
      }
    }
    return input;
  }
  function step(mask) {
    const input = update(mask);
    const slot = input.target === 255 ? 0 : 1;
    operations.forceContact(actors[slot], slot, { dx: 0, dy: 0, forced: true });
    actors[0].contactFlags = actors[1].contactFlags;
    return input;
  }
  return { step, controls };
}
