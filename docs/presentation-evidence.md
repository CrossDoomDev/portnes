# Native menus, intro, passwords, radio and endings

`presentation.js`, `cutscene.js` and `password.js` translate frontend control and story sequencing into JavaScript. `presentation.json` contains semantic actions and text, with no original images, sound samples or executable program. `presentation-renderer.js` draws newly designed menus; the native renderer supplies its own illustrations and sprites.

## Differential checks

| Reference | Comparison |
| --- | --- |
| F90B–FAA4, two intro choreographies | 886 consecutive actor/layout updates: 320 and 566; full positions, movement, lifetimes, appearance IDs and sound signals |
| C568–C5A3, FFB9/FF6A–FFE5 | 512 canonical position passwords and 32,768 valid/invalid decoding results, including wrapped decimal input |
| C9C8–CA43 | 128 queues, 4736 control polls; A/B repeats, cycling, Start/Select exit and queue clearing |
| C937/EAE2 inside C116–C169 | 64 gameplay frames interrupted by 1280 radio polls; full game state after resumption |
| C81F/C7EC and actual reload/layout procedures | 128 initial-state and 128 populated-state checkpoint resumes |
| Common game loop in 128 additional campaign positions | 97,200 consecutive frames with mixed directions and both weapons; full actor/cache/layout state at every frame |

Intro comparison excludes five unused fields of actor 16 that originally hold the old interpreter pointer and dispatch trampoline. Native code uses a semantic action index instead. Every actor position/motion field and logical component is compared. The complete introduction also reproduces the final actor/cache/environment state when console presentation waits are excluded; entry/exit scheduling is not a certification of identical hardware timing.

Radio ID 255 is a valid first message and a terminator only in the following queue positions. The four contact messages 252–255 result from wrapped addition of the contact item IDs. Treating 255 as an unconditional empty queue would discard a real story message.

Gameplay interruption uses a JavaScript generator: item effects occur first, the radio opens before ordinary damage, and the collision plus remaining frame passes resume after closing. The hardware countdown continues during the modal interaction. No actor update is run during it. This is tested against the original combined frame, rather than only checking the dialogue interface in isolation.

## Corrections found in integration

- Phase 6 resumes a checkpoint; phase 7 consumes an attempt and enters defeat/continue handling. The earlier implementation incorrectly resumed immediately in phase 7.
- Checkpoint/new-game reset clears every field of the second actor group. Clearing only one field retained stale enemy timers and state after a played scene.
- A scored collision selects the original alternative rectangle table for later projectile scans in the same pass. A destruction terrain edit restores the ordinary table. The native implementation represents this as an explicit collision geometry choice, not console bank switching. `combat-geometry.json` stores 16 ordinary rectangles for that case.
- Game over offers continue/title, resets score on continue and preserves stock until checkpoint reset. Passwords reset stock and score; they restore a route position, not a full save.
- Invalid seven-digit passwords display the error wait and return to title. Continue confirmation also has its original 120-tick, input-skippable wait.

## Remaining limits

The new menu/ending screens have functional tests, but every possible input-timing trace has not been compared to the original. The new renderer does not simulate the hardware cost of transferring old graphics or audio synthesis. Fade presentation, original audio-busy timing and complete route traversal remain verification boundaries. The broad-position test stops a scenario when it reaches defeat; it is not an automated full campaign playthrough.

Browser smoke verification covered title, password entry and checkpoint restoration, movement, both weapons, turret steering, inventory, and enabling the new audio. No application JavaScript errors were observed; browser extension metadata errors were excluded. [Menu screenshot](native-menu-1793235613099.jpg).

## New asset

`assets/garden-machines.webp` was generated with the built-in image generator using the `imagegen` skill and converted to WebP with alpha preserved. Prompt: a transparent 4×2 atlas of cheerful wooden/clay toy garden machines, centered in equal cells: locomotive, greenhouse rover, garden castle machine, flower-propeller airship, sunflower emplacement, mushroom radio tower, toy crab machine and duck paddleboat; pastel mint/coral/blue/yellow, no text, no existing franchise designs. It is a new artwork asset, independent of gameplay geometry.
