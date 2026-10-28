# Initial extraction report (historical)

This report describes the first extraction checkpoint. Current native coverage is **27 of 64 handlers**, with **37 remaining**. Spawn assembly, aiming, enemy weapons, projectile updates, damage and additional script fixtures are documented in [combat-evidence.md](combat-evidence.md). The original research tools named below are kept outside the release tree.

# Exact native extraction and bounded gameplay port

This folder is research, not a complete independent Iron Tank game. It does not change the existing project. None of the native modules import a ROM, NES, CPU, PPU or emulator. The development extraction scripts and oracle tests do use the original program as their reference.

## Reproduce

Run from this folder:

```
node extract.mjs
node oracle-tests.mjs
node script-tests.mjs
node scheduler-tests.mjs
```

Input is `../portnes/rom/iron-tank.nes`. Output data JSON files are normal JavaScript-readable game data, not a packaged cartridge or executable bytecode.

## Proven data coverage

- `spawn-data.json`: all512 global map page IDs,15 rows per240-pixel page,5468 spawn record occurrences,1260 distinct row-list addresses.
- Page linkage is exactly the same global page index as the original map renderer: `$05 + 256 * ($06 & 1)`. No invented stage-name or route grouping is added.
- Native spawn records preserve x position in8-pixel units (9-bit coordinate), screen-y nibble, variant nibble, spawn kind and raw flag6. Spawn activation still needs integration with the exact native scroll/frontier state.
- Descriptors for IDs `$40..$A9` preserve slot pool start/count, primary/secondary prototypes, variant mode and script entrypoint.
-192 valid script roots resolve to1081 normalized domain commands; zero unresolved graph nodes. The tail of the nominal256-word table at `$8580` is other data, not valid script roots.
- `native-data.json`:224 valid actor initialization prototypes,15 motion modes ×256 phase/direction cells,16 collision rectangles.
- `handler-coverage.json`:128 actor-kind dispatch entries,64 distinct entrypoints. `$D0C6` is the verified empty handler. The other63 handlers are explicitly unported.

## Exact original addresses

PRG bank numbering is zero-based,16KiB per bank. Fixed bank7 maps at`$C000`.

| System | Original routine/data |
|---|---|
|30 actors, stride8, active test and dispatch|bank7`$CA44`|
|Actor kind → handler pointer table|bank7`$CCA0`,128 words|
|Script command decode|bank7`$CB0E`|
|Ten script command constructors|bank7`$CAFA` pointer table|
|Blocking script updates|bank7`$CAE8` pointer table|
|World-page row spawn dispatch|bank7`$E429`|
|Page →16-bit row-table pointer|bank4`$8000..$83FF`|
|Spawn ID → script pointer|bank4`$8400..$857F`|
|Spawn pool/prototype descriptors|bank6`$AFC0`,3bytes perID minus`$40`|
|Primary/secondary prototype remapping|bank6`$B100`/`$B180`|
|Prototype initializer|bank5`$BE80`|
|Prototype pointer table|bank5`$ACC0`|
|Original motion decoder|bank7`$ED18`, pointers bank3`$A800`|
|16 hitbox rectangles|bank5`$AC80`|
|Exact rectangle overlap comparison|bank7`$EC78`|
|Heading correction lookup|bank7`$EE6E`:0,-1,-1,-1,-1,+1,+1,+1|

Actor storage is three parallel blocks of8 fields: position/appearance at`$0070+X`, behavior/state at`$0300+X`, auxiliary data at`$0400+X`. Active screen Y is`$0072+X`; values232..255 are culled to255. Scripted actors have the highbit set in`$0401+X`.

## Implemented and tested native semantics

`native-helpers.mjs` independently implements phase-indexed integer motion, prototype application (including16-bit x carry and relative positioning), rectangle overlap with the original unsigned wrapping and asymmetric edge comparisons, heading step, slot reservation and actor-dispatch order. Unknown AI kinds throw `UnportedActorError`; they are never silently skipped or replaced with generic behavior.

Oracle comparison results:

-3840 motion cases (15 modes ×32 directions ×8 phases), exact output bytes.
-224 prototype initializations, all24 actor fields compared.
-2048 randomized hitbox comparisons.
-30-slot scheduling fixture with exact original order/culling; unported-handler errors checked.
-4 script fixtures ×64 frames ×24 actor fields: turning, instant-turn flag, waiting, speed flag changes, fallback behavior assignment and exit to native behavior all match the original.

`native-scripts.mjs` implements the10 decoded domain commands: face, move, wait, jump, switch AI, set fallback AI, branch on range, set trigger range, aim/fire and speed. The script graph is editable data. It is not a6502 instruction interpreter.

Movement collision, player-relative angle/range and projectile emission are required semantic callbacks. They throw when needed but absent. They must be ported from the original shared routines before this can be integrated as a complete game. Move/fire/range branches have been transcribed from disassembly but do not yet have full oracle fixture coverage. The tests claim only the fixture coverage listed above.

## Remaining exact port work

All63 nonempty AI handlers and their shared dependencies remain unported; each original entrypoint and allkind IDs using it are listed explicitly in`handler-coverage.json`. They span original code entrypoints roughly`$CDA0..$EB90`, interleaved with shared code and data. That span is not a reliable executed-code coverage percentage.

Unported systems include full enemy/boss state machines, damage/destruction/projectile rules, exact collision response, scroll/spawn integration, dynamic spawn/replacement scripts, radio/events, upgrades/inventory/passwords, full campaign transitions and ending. There is no claim that these data/helpers form a playable or complete one-to-one native port.
