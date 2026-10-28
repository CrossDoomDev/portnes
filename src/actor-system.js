import { actorFromColumns, updateActors } from "./actors.js";
import { createActorHandlers } from "./actor-handlers.js";
import { createActorWeapons } from "./actor-weapons.js";
import { createSpawnSystem } from "./actor-spawns.js";
import { createScriptRunner } from "./actor-scripts.js";
import { relativeToActor } from "./actor-aiming.js";
import { findActorCollision, createActorCombat } from "./actor-collisions.js";

/** Native coordinator for the translated object subsystem. It is not a full
 * campaign coordinator: the caller owns camera, map mutation and pickups. */
export class NativeActorSystem {
  constructor({
    data,
    spawns,
    aiming,
    turrets,
    scores,
    dispatch,
    state = {},
    operations = {},
  }) {
    this.data = data;
    this.dispatch = dispatch;
    this.state = {
      mode: 0,
      modifiers: 0,
      equipment: 0,
      blastState: 0,
      reserveEnergy: 1,
      score: 0,
      highScore: 0,
      cameraLow: 0,
      ...state,
    };
    this.actors = Array.from({ length: 30 }, () => {
      const actor = actorFromColumns(
        Array.from({ length: 3 }, () => Array(8).fill(0)),
      );
      actor.y = 255;
      return actor;
    });
    const { handlers, effects } = createActorHandlers(
      data,
      aiming,
      this.actors,
      this.state,
      operations,
      turrets,
    );
    this.handlers = handlers;
    this.effects = effects;
    this.weapons = createActorWeapons(this.actors, effects, aiming, this.state);
    this.spawns = createSpawnSystem(spawns, data, this.actors, operations);
    this.combat = createActorCombat(
      this.actors,
      effects,
      this.state,
      scores,
      operations,
    );
    this.runScript = createScriptRunner(spawns.scripts, data, {
      relativeToPlayer: (actor) =>
        relativeToActor(
          aiming,
          actor,
          this.actors[0],
          0,
          this.frameCounter,
          this.state,
        ),
      fire: (actor, slot) => this.weapons.fire(actor, slot, this.frameCounter),
      collideMovement: (actor, slot, delta) => {
        if (typeof operations.sampleContact !== "function")
          throw Error("Unported script dependency: sampleContact");
        operations.sampleContact(actor, slot, delta);
      },
    });
  }
  update(frameCounter) {
    this.frameCounter = frameCounter & 255;
    updateActors(
      this.actors,
      this.frameCounter,
      this.dispatch,
      this.handlers,
      this.runScript,
    );
  }
  findCollision(sourceSlot, startSlot, count) {
    return findActorCollision(
      this.data,
      this.actors,
      sourceSlot,
      startSlot,
      count,
      this.state,
    );
  }
}
