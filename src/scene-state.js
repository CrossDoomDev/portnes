/** Two unscheduled records share original scene/HUD state. Keep those named
 * values linked when a coordinator supplies the records; never invent them. */
export function bindSceneState(state, reservedActors = state.reservedActors) {
  if (!reservedActors) return state;
  if (reservedActors.length !== 2)
    throw Error("Two reserved scene records are required");
  const links = {
    blastState: [0, "scriptLow"],
    deadFlag: [0, "heading"],
    healthSegments: [0, "timer"],
    statusTimer: [1, "appearance"],
    messageId: [1, "scriptLow"],
    messageState: [1, "scriptHigh"],
    radioPhase: [1, "counter"],
    radioTicks: [1, "timer"],
  };
  state.reservedActors = reservedActors;
  for (const [name, [index, field]] of Object.entries(links)) {
    const value = state[name];
    if (value !== undefined) reservedActors[index][field] = value;
    Object.defineProperty(state, name, {
      configurable: true,
      enumerable: true,
      get: () => reservedActors[index][field],
      set: (value) => {
        reservedActors[index][field] = value & 255;
      },
    });
  }
  return state;
}
