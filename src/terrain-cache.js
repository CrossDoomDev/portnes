import { byte } from "./actors.js";

/** Two halves of the original 15-row metatile cache, represented as level
 * cells rather than console memory. Explicit rows retain off-screen/stale
 * data until the camera or a map edit replaces them. */
export class TerrainCache {
  constructor(world) {
    this.world = world;
    this.cells = new Uint8Array(480);
  }
  loadRow(pageIndex, half, row) {
    if (half < 0 || half > 1 || row < 0 || row >= 15)
      throw Error("Invalid terrain cache row");
    const page = this.world.page(pageIndex);
    const values = this.world.chunks.get(page.chunks[half])[row];
    this.cells.set(values, half * 240 + row * 16);
  }
  loadPage(pageIndex) {
    for (let half = 0; half < 2; half++)
      for (let row = 0; row < 15; row++) this.loadRow(pageIndex, half, row);
  }
  metatile(column, row) {
    column = ((column % 32) + 32) % 32;
    row = ((row % 15) + 15) % 15;
    return this.cells[(column >> 4) * 240 + row * 16 + (column & 15)];
  }
  setMetatile(column, row, metatile) {
    column = ((column % 32) + 32) % 32;
    row = ((row % 15) + 15) % 15;
    this.cells[(column >> 4) * 240 + row * 16 + (column & 15)] = metatile;
  }
  flags(actor, delta, camera, point = false) {
    const offset = point ? 12 : 4;
    const x = (((actor.xHigh << 8) | actor.xLow) + delta.dx + offset) & 511;
    const localY = byte(actor.y + delta.dy + offset);
    const combinedY = localY + camera.fineY;
    const encodedY = byte(combinedY + (combinedY > 255 ? 16 : 0));
    const column = x >> 4,
      row = (encodedY >> 4) % 15;
    const quarterX = (x & 8) >> 3,
      quarterY = (encodedY & 8) >> 3;
    const environment = this.world.page(camera.environmentPage ?? camera.page);
    const definitions = this.world.collisions.get(
      `${environment.tileset}:${environment.materialPolicy}`,
    );
    let flags = 0;
    const extent = point ? 1 : 3;
    for (let y = 0; y < extent; y++)
      for (let dx = 0; dx < extent; dx++) {
        const qx = quarterX + dx,
          qy = quarterY + y;
        const id = this.metatile(column + (qx >> 1), row + (qy >> 1));
        flags |= definitions[id][((qy & 1) << 1) | (qx & 1)];
      }
    return flags;
  }
}

/** Exact F18C, F19B and F1DC actor terrain response over explicit cached cells.
 * sampleContact is the post-movement F19B entry used by actor scripts. */
export function createActorTerrain(cache, getCamera) {
  function sample(actor, slot, delta) {
    const raw =
      cache.flags(actor, delta, getCamera(), (actor.kind & 248) === 8) &
      actor.link;
    actor.contactFlags = (raw | ((raw & 64) << 1)) & 191;
    if (actor.contactFlags & 127) delta.dx = delta.dy = 0;
  }
  function gate(actor, slot, delta) {
    actor.contactFlags &= 128;
    if (!byte(actor.link << 1)) return;
    const x = byte(actor.xLow + 4),
      y = byte(actor.y + 4 + getCamera().fineY);
    if (
      (x & 248) === (byte(x + delta.dx) & 248) &&
      (y & 248) === (byte(y + delta.dy) & 248)
    )
      return;
    sample(actor, slot, delta);
  }
  function resolveContact(actor, slot, delta) {
    if (delta.forced) {
      sample(actor, slot, delta);
      return;
    }
    if ((byte(actor.y + delta.dy + 4) & 240) === 240) {
      actor.contactFlags |= 127;
      delta.dx = delta.dy = 0;
      return;
    }
    gate(actor, slot, delta);
  }
  return { resolveContact, sampleContact: gate, forceContact: sample };
}
