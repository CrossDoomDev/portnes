# Native player control extraction

Original source: uploaded Iron Tank USA cartridge SHA256 e219538626a929b5b6c570b9b2d9843afba171d3032de0bd3122f38077a71184.

## Deliverables

- `native-player.mjs`: independent high-level JavaScript translation, no imports, ROM loading, opcodes, CPU/PPU emulation or bytecode interpreter.
- `player-oracle-fixtures.json`: ~50KB of controller masks, named high-level expected states, checkpoints and digests recorded from the original program. No ROM bytes or machine snapshots.
- `native-player.test.mjs`: Node built-in tests only. Runs without ROM or JSNES. `node --test native-player.test.mjs` passed 3/3.

Research-only files `differential.mjs`, `inspect.mjs`, `disasm.py`, disassembly, JSON snapshots and py65 dependency should not ship as runtime. They depend on original ROM/JSNES only for extracting reference behavior.

## Proven facts

- Controller polling routine `$EDEA..$EE5D` packs A=128, B=64, Select=32, Start=16, Up=8, Down=4, Left=2, Right=1.
- `$30` stores held input; `$22` is rising edges OR auto-repeat edges.
- Newly pressed A resets `$31`, held A increments it modulo256, every16th held frame emits repeat A. B uses `$32` and8frames. Releasing does not reset the repeat counter; next rising edge resets it.
- `$EE5E` direction table maps low4input bits to twice an angle, sentinel255 for no valid direction: `[255,4,12,255,8,6,10,8,0,2,14,0,255,4,12,255]`.
- Angle0 is north; angles1..7 turn clockwise.
- `$77` turret angle, `$7F` hull angle. `$78/$79` hull X (16bit), `$7A` hull screen Y (8bit); `$70/$71/$72` are corresponding turret position. Screen Y later interacts with original camera routine, outside this module.
- `$D007` chooses turn increment `[0,-1,-1,-1,-1,1,1,1][(current-target)&7]`; exactly opposite target turns counterclockwise.
- Turret only turns on B **trigger/repeat**, not every held frame. First B+direction turns45° immediately, then another45° at frame7, then every8held frames.
- Hull phase `$030F` decrements modulo256 when direction is valid; turns happen only when low2bits become0, producing4frames per45°. It freezes without directional input. Hull does not translate while still aligning to a free requested heading.
- Standard hull speed low nibble is3 (`$7E=0x33` initially). Bank3 `$A8C0` has64encoded velocity bytes: cardinal1pixel/frame; diagonal per-axis movement pattern `[1,1,0,1,1,1,0,1]`, indexed by decremented phase&7. Diagonal speed is0.75 per axis, not a normalized floating vector.
- Coordinator `$CE70..$CF5B` checks desired-heading collision, attempts neighbor headings `direction-1`, then `direction+1`, has a20frame obstruction patience counter `$41`, and can move in current heading while desired heading remains obstructed.
- Forced stationary collision `$F1DC` is used after all3headings are blocked; nonstationary checks call `$F18C` (boundary fast-path). Resolver callback includes `forced` so these remain distinct.
- Collision result low7bits cause velocity to become0; bit0x80 alone does not. Parent resolver should return explicit adjusted dx/dy.
- Cannon spawn callback occurs before turret rotation, only when A triggered. On successful spawn recoil becomes16 then decrements to15 in the same update; existing recoil decrements toward0. Machinegun callback occurs on B trigger, before turn.
- Player coordinator clears `$07F0` before movement; collision routines do not write it. Shared fast-probe branch is therefore inactive within this extracted player path.

## Validation and boundaries

Research differential harness passed3000input frames against original unmodified polling routine and3200control steps against original `$CE70..$CF5B` with collision, camera and projectile allocation stubbed to explicit callbacks. Eight initial heading/phase scenarios included free movement and synthetic blocked regions. Exported fixtures preserve all-step digests and per17/100frame checkpoints for standalone tests.

This is a proven control coordinator under its callback contract, **not a complete player/game port**. It does not implement actual world collision sampling/gating, original camera scroll, actor-to-actor damage, energy/lives, projectile allocation/movement/weapon modifiers, inventory, radio, bosses, scene transitions, or all nonstandard speed modes. The default velocity implementation is standard player speed3 only. Those subsystems must be translated separately; substituting invented behavior would not meet one-to-one fidelity.
