import PaletteTable from "../vendor/jsnes/ppu/palette-table.js";

// Render-only mapping. No writes to ROM, CPU RAM, PPU registers or palettes.
// These six material IDs address the generated 3 x 2 texture atlas.
export const MATERIAL = Object.freeze({
  SAND: 0,
  GRASS: 1,
  WATER: 2,
  STONE: 3,
  STEEL: 4,
  ASH: 5,
  DARK: 6,
  LIGHT: 7,
});
const palette = new PaletteTable();
palette.loadNTSCPalette();
const lookup = new Map();

function classify(color) {
  const r = color & 255,
    g = (color >> 8) & 255,
    b = (color >> 16) & 255;
  const high = Math.max(r, g, b),
    low = Math.min(r, g, b),
    value = high / 255;
  let material, rgb;
  if (high < 24) {
    material = 6;
    rgb = [11, 17, 16];
  } else if (high - low < 40) {
    if (value > 0.85) {
      material = 7;
      rgb = [235, 227, 206];
    } else {
      material = 3;
      rgb = [44 + value * 135, 53 + value * 132, 52 + value * 124];
    }
  } else if (b > r * 1.25 || (g > r * 1.55 && b > r * 1.4 && b > g * 0.55)) {
    material = 2;
    rgb = [25 + value * 45, 56 + value * 91, 68 + value * 104];
  } else if (g > r * 1.15 && g > b * 1.05) {
    material = 1;
    rgb = [29 + value * 68, 43 + value * 89, 28 + value * 51];
  } else if (r > g * 2.8 && r > b * 1.6) {
    material = 5;
    rgb = [105 + value * 130, 39 + value * 67, 25 + value * 32];
  } else if (r > b * 1.35 && g > b * 1.3) {
    material = 0;
    rgb = [72 + value * 135, 59 + value * 116, 36 + value * 81];
  } else {
    material = 4;
    rgb = [63 + value * 88, 65 + value * 91, 51 + value * 83];
  }
  return [...rgb.map(Math.round), material];
}

// Cover every emphasis and grayscale value, including mid-frame palette changes.
for (const table of palette.emphTable)
  for (const color of table) lookup.set(color, classify(color));

export function makeMaterialFrame(
  frame,
  ppu,
  target = new Uint8Array(256 * 240 * 4),
) {
  if (frame.length !== 61440 || target.length !== 245760)
    throw new Error("Invalid frame dimensions");
  for (let i = 0; i < frame.length; i++) {
    const color = frame[i] & 0xffffff;
    let mapped = lookup.get(color);
    if (!mapped) {
      mapped = classify(color);
      lookup.set(color, mapped);
    }
    const offset = i * 4;
    target[offset] = mapped[0];
    target[offset + 1] = mapped[1];
    target[offset + 2] = mapped[2];
    // The low byte holds scanline sprite priority. 65 means no sprite.
    const visibleSprite =
      ppu &&
      (ppu.pixrendered[i] & 255) < 8 &&
      (!(ppu.pixrendered[i] & 256) || frame[i] !== ppu.bgbuffer[i]);
    target[offset + 3] = mapped[3] + (visibleSprite ? 8 : 0);
  }
  return target;
}

export function materialScroll(ppu) {
  return [(ppu.regHT * 8 + ppu.regFH) % 128, (ppu.regVT * 8 + ppu.regFV) % 128];
}
