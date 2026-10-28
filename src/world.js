/** Native level lookup. Reads ordinary decoded JSON only; no NES dependencies. */
export class WorldMap {
  constructor(data) {
    if (data.schema !== 1) throw new Error("Unsupported world schema");
    this.data = data;
    this.width = data.coordinateSystem.worldWidth;
    this.height = data.coordinateSystem.worldHeight;
    this.chunks = new Map(data.chunks.map((chunk) => [chunk.id, chunk.rows]));
    this.collisions = new Map(
      data.collisionDefinitions.map((set) => [
        `${set.tileset}:${set.materialPolicy}`,
        set.metatiles,
      ]),
    );
  }
  at(worldX, worldY, environmentPage = null) {
    const x = ((Math.floor(worldX) % this.width) + this.width) % this.width;
    const y = ((Math.floor(worldY) % this.height) + this.height) % this.height;
    const page = this.data.pages[Math.floor(y / 240)],
      localY = y % 240,
      half = x >> 8;
    const id = this.chunks.get(page.chunks[half])[localY >> 4][(x & 255) >> 4];
    const quadrant = ((localY & 8) >> 2) | ((x & 8) >> 3);
    const environment =
      environmentPage === null ? page : this.page(environmentPage);
    const collision = this.collisions.get(
      `${environment.tileset}:${environment.materialPolicy}`,
    )[id][quadrant];
    return {
      page: page.index,
      chunk: page.chunks[half],
      metatile: id,
      quadrant,
      collision,
      tileset: page.tileset,
      materialPolicy: page.materialPolicy,
    };
  }
  collisionAt(worldX, worldY, environmentPage = null) {
    return this.at(worldX, worldY, environmentPage).collision;
  }
  page(index) {
    return this.data.pages[((index % 512) + 512) % 512];
  }
}

/** Original F27E rectangle: nine8px collisioncells over a24px actor. */
export function actorCollisionFlags(world, x, y, environmentPage = null) {
  let flags = 0;
  for (let row = 0; row < 3; row++)
    for (let column = 0; column < 3; column++)
      flags |= world.collisionAt(x + column * 8, y + row * 8, environmentPage);
  return flags;
}
/** Native F18C/F1DC gate for original screen-space actor state.
 * getCamera returns {page:0..511,fineY:0..239}. Dynamic destroyed tiles may be
 * supplied through a WorldMap-compatible collisionAt implementation.
 */
export function createPlayerCollisionResolver(
  world,
  getCamera = () => ({ page: 511, fineY: 0 }),
) {
  return (state) => {
    const { page, fineY } = getCamera(),
      dx = state.dx ?? 0,
      dy = state.dy ?? 0;
    const x = state.x & 511,
      y = state.y & 255,
      mask = state.collisionMask ?? 0x81;
    let flags = state.collisionFlags ?? 0;
    if (!state.forced) {
      if (((y + 4 + dy) & 255 & 240) === 240)
        return { flags: flags | 127, dx: 0, dy: 0 };
      flags &= 128;
      if (((mask << 1) & 255) === 0) return { flags, dx, dy };
      const beforeX = (x + 4) & 255,
        beforeY = (y + 4 + fineY) & 255;
      if (
        (beforeX & 248) === ((beforeX + dx) & 255 & 248) &&
        (beforeY & 248) === ((beforeY + dy) & 255 & 248)
      )
        return { flags, dx, dy };
    }
    const sampleX = (x + 4 + dx) & 511;
    const sampleY = page * 240 + fineY + ((y + dy + 4) & 255);
    const raw = actorCollisionFlags(world, sampleX, sampleY, page) & mask;
    flags = (raw | ((raw & 64) << 1)) & 191;
    return { flags, dx: flags & 127 ? 0 : dx, dy: flags & 127 ? 0 : dy };
  };
}
