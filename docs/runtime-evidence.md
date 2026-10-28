# Native game loop, player arsenal and campaign events

The browser now has an actual playable **Играть** mode. `NativeGame` connects controls, player weapons, terrain, all actor handlers, collision/damage, row spawning, camera traversal, inventory stocks, page routes, radio notifications and scene changes. The old controller-only view remains a separate inspection tab.

This checkpoint implements the requested common gameplay systems. It does **not** certify a complete one-to-one port of every screen or a full campaign playthrough.

## Original procedure comparisons

| Native implementation | Original reference | Differential coverage |
| --- | --- | --- |
| Player cannon, machine gun, modifier/stock consumption, selection and pickups | E1B9–E250, FC49–FD11, EAE2/EAF4, bank 5 BF50 | 7 procedures × 2048 cases = 14,336 |
| Player actor/controller and camera routing, using actual terrain and weapons | CE5D/CE70, bank 3 BD40 | 4096 states; four player motion modes, normal/locked/special camera modes |
| Route choice, environment changes, music signals, radio countdowns and transition gates | bank 1 BE00, EFC3, F060, F0AA, C16A, E6E8, E8BF | 7 procedures × 2048 cases = 14,336 |
| Logical visibility/layout state | bank 6 B200–B505 | 4096 passes, both frame orders, clipping, component budget and all 32 actor/scene records |
| Common active-game frames | C116–C169 and actual called game routines | 8 continuous sequences, 9984 frames, 340 actual RNG calls |
| Scene transitions, full terrain reload and arena creation | E8BF and actual F212/E9F2/F772 within the common frame | 4 continuous sequences × 128 frames, 12 additional actual RNG calls |
| Checkpoint return and cache/layout restoration | C81F and actual reset, camera and environment procedures | 128 checkpoint resumes |

The twelve continuous sequences total **10,496 frames** and **352 actual RNG calls**. The original reference retains its state across consecutive frames; it is not reset from the native state at each tick. Compared state includes every field of 32 actor/scene records, all 480 live terrain cells, 63 logical component records, page/camera coordinates, random seed, frame counter, controls, stocks, score/high score and named music signals.

The isolated arsenal/transition tests deliberately replace modal presentation with semantic notifications. The combined scene tests execute the original map edits, full row reload and boss allocation together, excluding only console graphics-transfer waits, old palette flashes, sound synthesis and fade presentation. Their absence is intentional: HTML5 uses its own renderer and audio. The fixtures do not establish equivalence of hardware wait durations or original audio-busy timing.

## Game frame order

`NativeGame.step(mask)` advances the countdown and runs the common active-game pass in original order:

1. Player controls and weapons when the player body has kind 31.
2. Camera movement, row refresh and object displacement.
3. Scheduled actor/script pass, including within-pass frame-counter changes.
4. Logical visibility/layout update.
5. On odd countdown frames: player/body and player-projectile collision passes, then campaign flag/music synchronization.
6. Frontier row spawning against the **updated** camera position.
7. Scroll request reset, radio countdown and blast/shake pass.
8. The periodic player style/death checks.

Pause and inventory keep polling controls while ordinary actor updates are suspended. Inventory activation, pickup effects, shield reserves, successful-shot costs, resource exhaustion and mutually exclusive modifiers use the translated rules. Checkpoint return retains collected stocks and applies the original checkpoint table's wrapped selector, including fallback entries.

## Why logical layout remains separate from graphics

The original display pass changes actor offscreen flags. Its old component state also supplies part of the RNG context. Omitting that state changes later enemy behavior even if the new artwork looks correct.

`layout-state.js` maintains ordinary named records (`x`, `y`, `layer`, `token`) and the original ordering/budget/culling arithmetic. Its normalized metadata contains component positions and classification tokens, **not original pixel images**. These records are never sent to the canvas renderer. `garden-renderer.js` draws the newly generated toy actors, terrain and HTML5 HUD independently; changing artwork does not change collision or RNG.

`game-random.js` resolves 17 known actor call paths to their actual actor/layout fields, then applies the already verified arithmetic. Separate research checked 7668 calls to identify these paths, including the deeper route/seek branch. Runtime code has no emulated stack, CPU or machine-code execution. There is no replacement `Math.random()` stream.

## Integration defects caught and fixed

- A script switching into ordinary AI keeps the low direction bit as an extra carry in its initial timer: the correct value is sometimes 2 rather than always 1.
- Ordinary downward camera requests are preserved even in the upward-scroll-lock mode; they are normalized to zero by the subsequent camera pass.
- The large-health pickup can leave an unaligned reserve-energy cursor for its following notification check. Native pickup code retains the corresponding field selection instead of always reusing the original pickup slot.
- Entering an arena must make the transition actor active at Y=0 **before** allocating the boss layout. Marking it inactive early reuses its slot and can immediately kill the player. The full combined transition sequence now verifies the correct allocation and subsequent damage order.

## Remaining boundaries

- The original title/intro, password entry, continue/game-over menus and complete ending presentation are not implemented by this checkpoint. The new browser UI starts in an initialized playable state and displays a completion state when the translated campaign handler requests it.
- Radio IDs, triggers, countdown and inventory access are connected; complete original radio dialogue/page navigation is not yet ported. The current UI shows signal/message notifications.
- Modal fade durations and the original audio engine's busy flags are presentation boundaries; new music/effects use Web Audio and their own composition.
- Full-route and full-campaign traversal, every stock combination and all exceptional shared scratch-value dependencies still need broader comparison. The active-frame tests include selected ordinary/modifier/breakdown states, not an exhaustive proof of all reachable states.
- The actor registry remains `campaignIntegrationComplete: false` until full traversal and remaining campaign screens are verified. This is distinct from the common gameplay coordinator now being implemented.

The full native suite contains **51 tests**. It runs without a cartridge or emulator. Research tools remain outside the native branch. Build output contains only HTML, CSS, JavaScript, ordinary JSON gameplay data and new image assets.
