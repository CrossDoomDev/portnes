import { ACTOR_FIELDS } from "./actors.js";
import { originalRandom } from "./random.js";

/** Resolve the actual actor/layout fields used by each original RNG call path.
 * The layout is logical state, independent of the new artwork or audio.
 */
export function createGameRandom(data, actors, state) {
  const contexts = new Map(data.contexts.map(value => [value.key, value]));
  return (key, actor, slot, frame, site) => {
    const id = [state.activeHandler, key, site ?? ""].join(":"), context = contexts.get(id);
    if (!context) throw Error(`Unknown random context ${id}`);
    if (!state.layoutParts) throw Error("Random context requires logical layout state");
    const values = [];
    for (let i = 0; i < 4; i++) {
      const offset = context.actorFieldOffset + i;
      values.push(actors[offset >> 3][ACTOR_FIELDS[1][offset & 7]]);
    }
    for (let i = 0; i < 4; i++) {
      const offset = context.layoutFieldOffset + i;
      values.push(state.layoutParts[offset >> 2][["y", "token", "layer", "x"][offset & 3]]);
    }
    state.seed = originalRandom(state.seed, state.frameCounter, values);
    return state.seed;
  };
}
