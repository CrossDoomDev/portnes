# Native map edits and common camera pass

`src/map-changes.js` implements destruction/scene terrain edits with ordinary JavaScript over `TerrainCache`. `src/camera.js` implements the common camera update, row reload and object displacement. Neither module loads an original program or emulates console hardware.

## Compared behavior

| Component | Original reference | Differential coverage |
| --- | --- | --- |
| Map edit selection, rectangle writes, retained redraw-half flag | F772, bank 2 9F00, F7D5 | All 68 table entries × 64 initial states = 4352 cases |
| Repeated and overlapping edits | Same procedures | 2048 consecutive edits on one shared cache |
| Horizontal camera arithmetic, negative Y normalization, 240px page wrap, row reload, object shift, reserved anchors | EE9C–EF30, EF8D–EFC2, F106, F132–F176 | 8192 states with varied positions, modes, requests and initially mixed cache cells |
| Continuous scrolling | Same procedures | Four sequences × 4096 frames, crossing page 511, 256, 1 and 0 boundaries |

The development oracle compares every field of all 32 actor/scene records, all 480 live cache cells, camera coordinates, the full 16-bit page counter, mode, equipment and environment/row notification order. For map changes it also compares the exact redraw-row sequence. Native regression fixtures contain checksums and semantic input generation only; no original executable, original graphical data or emulator is included.

An additional native integration test destroys an actor through `NativeActorSystem.effects.destroy`, checks that the same cache immediately changes collision results, and checks that the native camera reload of that source row restores the original cells and collision result.

## Rules preserved

- The table contains 59 active rectangle edits and nine empty entries. Empty entries have no effect, including no change to camera flags. `data/map-changes.json` contains decoded rectangles rather than addresses or an instruction stream.
- Destruction edits the live cache, not the immutable world chunks. Later source-row loading replaces these changes, as in the original. There is no invented persistent destruction overlay.
- Overlapping edits apply in call order. Both map halves use their own cache cells. The original redraw-half bit remains in `state.cameraHigh` after a nonempty edit.
- Three original table entries also write palette attributes. These describe old graphics only; they are discarded. The new renderer receives a semantic rectangle notification and uses its own artwork. No old tile pixels or palettes enter the new project.
- The common camera pass sign-extends horizontal requests. Every negative vertical request becomes exactly -1; nonnegative requests do not advance Y.
- At a 240px vertical boundary, the original counter arithmetic and 16-bit page wrap are retained. World lookup uses the low nine page bits.
- Source rows reload when `(fineY + 8) & 15` is zero, left half first, then right. Offscreen cells remain stale until their particular row reloads. This ordering also determines when destruction is replaced.
- Active slots 2 through 29 move down one pixel after negative scrolling. The two player slots are excluded; inactive Y=255 stays inactive. Both reserved scene records receive the original horizontal anchors, including the fixed anchor in special mode.
- The environment pass occurs at fineY=232 before either row reload. Its actual campaign event bodies remain separate dependencies.

## Integration API and limits

`NativeActorSystem` accepts `mapChanges` plus `terrainCache` to install native map mutation for actor destruction and boss handlers. `operations.onMapChange(event)` observes the finished edit. When these data are supplied, the native implementation handles edits; a custom `operations.changeMap` does not replace it.

Supplying `world` and `terrainCache` also exposes `system.camera.advance(horizontal, vertical)`. The caller supplies `state.worldPage`, `cameraLow`, `cameraHigh`, `cameraFineY`, `mode`, `equipment`, and two reserved scene records. `operations.refreshEnvironment(state)` must implement the separate environment/event pass; missing dependencies fail explicitly.

The camera oracle isolates the environment/event body and console-only graphics transfer work. It verifies their invocation timing, not their unfinished campaign effects. The source world currently has zero descriptor high flags throughout; the special descriptor-driven actor conversion path is translated but is not exercised by the original-data camera fixtures.

This checkpoint does **not** complete player-to-camera movement routing, the full frame coordinator, row-spawn activation order, page events, music/radio transitions, item/resource rules or campaign traversal. The browser still shows an inspection interface, not a playable full port. The full test suite now contains 42 tests.
