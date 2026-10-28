/** Native map destruction and scene edits (F772 / bank 2 9F00).
 * Edits belong to the live terrain cache: loading a source row replaces them.
 * Old palette attributes and console transfer queues have no gameplay role;
 * the new renderer receives the changed rectangle directly instead.
 */
export function createMapChanges(data, cache, state, onMapChange = () => {}) {
  if (data?.schema !== 1 || !Array.isArray(data.changes))
    throw Error("Unsupported map-change schema");
  if (!cache || typeof cache.setMetatile !== "function")
    throw Error("Map changes require a live terrain cache");

  return function changeMap(id) {
    if (!Number.isInteger(id) || id < 0 || id >= data.changes.length)
      throw Error(`Unknown map change: ${id}`);
    const change = data.changes[id];
    if (change === null) return null;
    if (!Number.isInteger(state.cameraHigh))
      throw Error("Map changes require cameraHigh");
    const { half, column, row, rows } = change;
    for (let y = 0; y < rows.length; y++)
      for (let x = 0; x < rows[y].length; x++)
        cache.setMetatile(half * 16 + column + x, row + y, rows[y][x]);

    // Original F7D5 retains the redraw half in the camera's high bit.
    // Preserve this shared state even though our renderer needs no tile queue.
    state.cameraHigh = (state.cameraHigh & 127) | (half << 7);
    const event = {
      id,
      half,
      column: half * 16 + column,
      row,
      width: rows[0].length,
      height: rows.length,
    };
    onMapChange(event);
    return event;
  };
}
