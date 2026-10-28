# Native enemy steering and cached terrain

This checkpoint adds ordinary JavaScript movement state machines, emplacement/special-projectile handlers and a semantic terrain cache. It contains no cartridge or emulation runtime. Original procedures were executed only by separate development tools to produce differential fixtures. Native tests need no original program.

## Differential coverage

| Module                                                         | Original routines                                                                       | Recorded comparisons                                                                                                                   |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `actor-locomotion.js`                                          | CF5C passage search; E0E3 movement; E16D turning; E0B8 turn choice; E09F weapon pause   | 8192 helper cases, comparing all actor fields, blocked result where applicable, and random call count/seed                             |
| `actor-movement-handlers.js`                                   | DC6E, DD4E, DDAC, DDD3, DDEC, DE0B, DE43, DE64, DE88, DB9C                              | 10 handlers × 1024 cases each                                                                                                          |
| Additional `actor-handlers.js` entries and `emplacements.json` | D7DF, D802, D855, D8C3, DF71, E02B, DFF3, D686, D6AB, E655, D386                        | 11 handlers × 1024 cases each                                                                                                          |
| `terrain-cache.js`                                             | F1DC forced contact, F18C movement contact, F19B post-movement contact                  | 3 routines × 4096 cases, arbitrary cached metatiles, 27 environment combinations, camera fineY 0–239, varied masks/kinds/byte overflow |
| `actor-system.js` with actual cached terrain                   | CA44 scheduler plus the above movement, existing projectile/weapon and contact routines | 8 controlled scenarios × 512 frames × 30 slots × 24 fields                                                                             |

Together with the earlier checkpoint, 48 of 64 handler entrypoints are translated: 44 nonempty and four confirmed empty routines. **16 handlers and full campaign integration remain unfinished.** These counts are not a percentage of game completion.

## Retained behavior

- Passage search tries the current heading, then one step counterclockwise, then one clockwise from the starting heading. It preserves a successful alternative heading.
- Short probes use movement phase zero. Long probes multiply the signed vector by 16 with byte wrapping. If all directions and the stationary sample are blocked, the actor is replaced using empty death/drop prototypes. Its original phase is then restored even after replacement.
- Pursuit, retreat, hold-distance, cooldown and avoidance retain original integer phases and timer wrapping. Close-range variants can change AI kind or enter timed retreat rather than following a generic pathfinding algorithm.
- The routing branch in DE88 retains long-range probing when it calls its subsequent pursuit or route-direction branch. A multi-frame terrain comparison caught this dependency; the native function now passes it explicitly.
- The steering grid now includes the original decoded route-direction field. It contains gameplay classifications/directions, not executable instructions or graphics.
- Fixed weapons retain heading masks, palette flicker, shot offsets, timer gating, linked-body delays and special missile/curved-shot updates. A timed clear-state handler retains its counters and mode transition.
- Cached terrain contains two 15-row halves. Reads wrap those rows and horizontal halves exactly; a row keeps its old metatiles until an explicit load/edit changes it. The collision sampler does not substitute a direct lookup into whichever world page happens to be nearby.
- Actor kinds 8–15 use a point sample at +12px; other kinds use the original 3×3 collision-cell footprint at +4px. Boundary blocking, collision masks, bit-6 promotion and bit-7 preservation remain distinct.

## Native integration

`NativeActorSystem` accepts decoded `emplacements` alongside the existing actor, spawn, aiming, turret and score data. `createActorTerrain(cache, getCamera)` supplies its `resolveContact` and `sampleContact` operations. The cache exposes `loadPage`, `loadRow` and `setMetatile`; scrolling and dynamic map mutation must call them at their original times.

The integrated fixtures use static camera positions and real decoded map cells on eight selected pages. Enemies and projectiles update together in original slot order. They do not run player input, actor-to-actor damage, camera movement, campaign events or a full original stage.

The 21 new handler fixture groups isolate contact responses through specified flags. The six movement helper groups also isolate contact. The separate cache tests and eight integrated scenarios then verify real collision classification and the combined update path.

Random call sites are explicit callbacks (`choose-turn`, `route-pause`). The tests deliberately supply controlled byte sequences and compare call order/count and the resulting state. They **do not** prove the original campaign RNG stream. Full random call contexts remain unfinished; an absent provider throws rather than silently using `Math.random()`.

For an inactive target, the original route helper can read a value formerly supplied through rendering state. The native API requires an explicit `inactiveRoute` context when that branch is reached. The full coordinator must restore that dependency; it is not replaced with an invented route.

## Remaining work

16 dispatch handlers still throw when encountered. They include player death, major boss bodies, linked scene parts, terrain/event objects and special scene initialization. Camera scroll/frontier timing, map changes, items and radio/inventory, player weapon resource rules, lives/fuel and complete campaign comparison are still incomplete. The browser remains a subsystem inspection surface, not a finished game.
