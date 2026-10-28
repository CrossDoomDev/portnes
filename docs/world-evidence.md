# Decoded world and collision research

Source cartridge SHA-256: `e219538626a929b5b6c570b9b2d9843afba171d3032de0bd3122f38077a71184`.
Address convention: 16KiB PRG bank index 0..7 and CPU address. File offset =16+bank*16384+(address&16383).

## Scope and important limits

`world-data.json` is ordinary decoded level data, not executable bytes, a ROM image, an encoded ROM, original pixel art, or a CPU/PPU program. It contains no PRG/CHR arrays. `world.mjs` has no emulator or cartridge dependency. The original ROM and JSNES are used only by analysis scripts outside the native game.

All **512 physical world page records** are extracted. This does not mean512 independent named game levels. Pages share122 map chunks; some records may be filler or unreachable under normal stage progression. Story-level names, stage-route conditions, destructible terrain edits, boss gating, and special transitions are not decoded by this module. Parent enemy/spawn research supplies actor placement separately.

Collision equivalence is proven for the extracted static geometry, 8px point sampler, 24px actor footprint and player gate on valid on-screen actor positions with camera fineY=0. Scrolling mixes adjacent pages in the original RAM cache. Static direct lookup with a camera-environment override should match ordinary in-view positions, but exact cache prefetch/stale-data behavior at off-screen bounds has not been ported or verified. Destroyed terrain changes need an explicit native overlay; this module does not invent those changes.

## Map layout

- World extent:512px wide,512×240=122880px high.
- Page index: RAM05+256*(RAM06&1). Initial page511, camera fineY RAM04=0.
- Initial viewport worldYorigin122640. Tank top-left screen(116,116) maps to world(116,122756), center(128,122768).
- Metatile16×16, collisioncell8×8. Each physical page contains two256px-wide halves, each16×15 metatiles.
- Bank6 `$B600..B9FF` contains1024 one-byte chunk descriptors, indexed(page*2+halfX).
- Descriptor lower7bits selects a16×16 source chunk in banks0/1: bank=id>>6; address=$8000+(id&63)*256. Only first15 rows are displayed; row15 is skipped by the world traversal.
- All current1024 descriptor highbits are zero. They are retained as descriptorFlags rather than assigned an invented meaning.
- Fixed-bank routine `$ED9D..EDBF` computes descriptor index; `$EF97..EFC2` selects sourcechunk; `$F503..F531` copies16 metatileIDs into RAM0600/0700.

## Environment metadata

Page metadata comes from bank6, table offset +pageIndex:

| Data | Pages0..255 | Pages256..511 | Native fields |
| --- | --- | --- | --- |
| Environment/event flags | BA00 | BB00 | paletteSet=low4bits,eventSelector=high4bits |
| Material/CHR selector | BC00 | BD00 | materialPolicy=high4bits; originalCHRselector not needed |
| Tile-class/graphics flags | BE00 | BF00 | tileset=low3bits; sourceGraphicsFlags retained for research |

`$EFC3..F05F` applies these records. `eventSelector` dispatches via `$F095..F0A7`; their event bodies are outside this extraction. `sourceEnvironmentFlags` and `sourceGraphicsFlags` are scalar metadata fields, not graphics payloads.

## Collision conversion

Bank3 has eight sets of256 metatiles, four quadrant classification pages each. In original `$F583..F5C5`, the four bytes also select graphical8×8 tiles. During extraction, their highnibbles are converted through bank3 BF00 collision table with materialPolicy; original tileindices are discarded. The resulting native `collisionDefinitions` contain only four gameplay flags per metatile.

`$F443..F4FB` samples one8px cell. Native `WorldMap.at(x,y,environmentPage?)` selects physical metatile and quadrant. When environmentPage is supplied, flags use the camera environment, matching the original global RAM34/RAM37 behavior.

`$F27E..F442` constructs a4×4 temporary collision grid, then ORs a3×3 region. This equals nine samples spaced8px apart, starting at actor top-left+4+velocity. `actorCollisionFlags` reproduces the OR.

`createPlayerCollisionResolver` reproduces `$F18C..F211`:

1. Block attempted origin boundary in screen row F0..FF, setting low7 collision bits.
2. Preserve previous collision bit80 while clearing low7bits.
3. Skip resampling if the actor mask's lower7bits arezero or neither coordinate crosses an8px boundary.
4. Forced queries bypass these gates and run `$F1DC` directly.
5. Mask raw collision flags by actor collisionMask(default81), promote40→80, clear40.
6. Any low7bits block velocity; bit80 alone does **not** stop velocity.

First page511, tileset0/materialPolicy0: metatile120 and111/112 are visibly water and have collision1; tree/cliff54/60 have collision3; land0/70/88 collision0. These semantic labels must not be generalized to all policies. Native art can freely choose distinct styles for generic passable/blocked classes without changing geometry.

## Outputs and executable checks

- `extract-world.py`: standalone analysis extractor, takes sourceROM/outputJSONpaths.
- `world-data.json`:269276bytes decoded game-level data.
- `world.mjs`: nativeWorldMap, actorCollisionFlags and createPlayerCollisionResolver.
- `differential.mjs`: analysis-only differential against original routines, no instrumentation changes to checked-in emulator source.
- `world-report.json`: completed differential counts.
- `world-fixtures.json`: compact captured expected values, independent of ROM at native-test time.
- `native-world.test.mjs`: native-only regression tests. Adjust relativeimports when copying into project directories.

Differential result:512pages;15360copied rows;245760metatile placements;8552distinct pointcollision cases;8192actor rectangle cases;8192player resolver cases, allPASS. `node --test native-world.test.mjs` runs without ROM or emulator.
