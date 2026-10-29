# Native boss and scene handler translations

All 64 distinct original actor dispatch entrypoints now have native JavaScript translations (60 nonempty routines and four empty ones). **This does not complete the game port.** Player weapon resources, items/menus/radio and full campaign coordination remain unfinished. Native map edits and the common camera pass were added in the subsequent [map/camera checkpoint](map-camera-evidence.md).

The new code uses semantic objects, decoded tables and normal functions. It does not load a cartridge, emulate a console, interpret instructions or render original graphics. The separate development oracle executed original procedures only to record expected results; those tools and the original program are outside this branch.

## New differential coverage

| Native component                                                                                | Original reference                                                                             | Compared cases                                                                                                          |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Scene anchor, arena camera, composite movement, pose, muzzle placement, orbit, layout assembly  | DB61, D738, D797, D49F, D4B5, bank 3 BE0C, E9F2                                                | 7 helpers × 512 cases; layout cases include full and nearly full actor pools                                            |
| Boss bodies and remaining linked/special objects                                                | D415, D537, D5C4, DF29, DF7C, D9AC, DA86, D8DE, DA1A, DBE9, DAFF, E733, D2DC, D2FF, CDA0, CDE5 | 16 handlers × 1024 cases; all fields of 32 records and named scene state compared                                       |
| Four decoded boss layouts with real cached-terrain contact and native projectile/weapon updates | CA44 update pass and the translated subroutines                                                | 4 controlled scenes × 768 frames, all 32 records plus camera, frame counter, anchor, RNG call count and map event order |
| Destruction of the player within an object update pass                                          | CDE5 plus later CA44 actors                                                                    | 8-frame sequence checking propagation of the changed frame counter to subsequent actors                                 |

The new fixtures cover 19,968 isolated helper/handler cases and 3080 combined frames. Tests run without an original cartridge or emulator.

## Behavior retained

- Large bodies move their attached kind-13 parts before moving themselves. One orbiting body additionally moves slot 3 using the same delta, even when that slot has already moved.
- Boss camera anchors use the original integer complement arithmetic, including the one-pixel offset. Poses, headings, muzzle offsets and phase thresholds come from decoded gameplay tables; they are not replaced with generic enemy behavior.
- Linked objects scan in original order and preserve the original rules for inactive bodies, x wrapping, cooldowns and sprite/heading changes. Some scans read two unscheduled records beyond the 30 updated actor slots.
- `scene-state.js` explicitly links those two supplied records to named blast, death, health-segment and status-timer fields. They are domain records, not an emulated memory or CPU. If a scan requires missing records, it throws instead of assuming they are empty.
- The DBE9 conversion path reuses an existing allocation cursor. In a normal dispatch pass its value is 76, so it can address fields across adjacent actor records rather than an aligned slot. A native record view preserves those field writes, byte wrapping and subsequent initialization. Controlled fixtures test both aligned and unaligned cursors. The coordinator sets the dispatch cursor explicitly.
- Layout initialization preserves the original pool-end overwrite when no free slot exists, coordinate borrow over a 240px vertical wrap and prototype initialization order.
- A large burst overwrites eight projectile slots and updates the blast counter with the original wrapping and bit rules.
- The player-breakdown handler preserves palette timing, two random calls, coordinate carry behavior and the extra timer carry from the random value's bit 4.
- At the end of that breakdown, the original changes the frame counter to 1 during the update pass. Native dispatch propagates the change immediately, including to the script runner used by later actors.

## API and data

`NativeActorSystem` accepts decoded `bosses` data in addition to actor, spawn, aiming, turret, emplacement and score tables. Its `scene` helper exposes layout creation and the translated camera/composite movement operations. `state.reservedActors` supplies the two unscheduled scene records when required.

`data/bosses.json` contains four scene layouts, phase directions, muzzle offsets and movement classifications. It contains no original sprite pixels, sound data, executable instruction stream or cartridge payload. The preserved anchor marker is state metadata; the new renderer can use its own artwork.

## Limits of verification

The isolated cases supply contact flags, map-change notifications, deterministic random bytes and HUD/audio callbacks. Map events are checked for order and IDs; the implementation was added later and is verified separately in [map-camera-evidence.md](map-camera-evidence.md). Display/HUD refreshes and console interrupt behavior are excluded from the isolated oracle, because the target uses a new renderer/audio system.

The combined boss scenes use native cached-terrain collision sampling and actual decoded layout records, with a stationary player and controlled initial boss states. HUD refreshes and map mutation remain isolated; RNG bytes are deliberately controlled on both sides. These scenes are not full stage playthroughs, and they do not prove the original campaign's RNG stream or all reachable states.

The handler registry is complete at the level of translated entrypoints. Full frame ordering outside the actor pass, scrolling/frontier event integration, equipment/resource rules, pickups, radio/inventory/passwords, lives/fuel, ending and full campaign comparison are still required before calling this a completed port.

Later checkpoint: native terrain mutation and the common camera pass are now implemented separately; full campaign integration remains unfinished. See [map-camera-evidence.md](map-camera-evidence.md).
