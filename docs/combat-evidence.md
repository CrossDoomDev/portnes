# Native object and combat checkpoint

This checkpoint contains independent, ordinary JavaScript functions and semantic JSON tables. No cartridge, console program, CPU/PPU/APU, runtime disassembler, instruction interpreter or emulator is present in the release tree. Reference routines were executed separately during development. Fixtures contain counts, named scenarios and SHA-256 output checksums, not executable code or original graphics.

## Verified translations

| Module                                | Original reference                                        | Differential coverage                                                                                            |
| ------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `actor-aiming.js`, `aiming.json`      | Bank 4 BF12–BFCA, direction/range and steering tables     | 12,000 inputs including unsigned overflow, inactive targets, alternate target slot and equipment modifiers       |
| `actor-spawns.js`                     | E479–E62E, native descriptors and prototypes              | All 5,468 record occurrences in four pool occupancy scenarios; all 24 fields of all 30 slots compared            |
| `actor-effects.js`                    | E3E7 allocation, EA84 destruction, EB90 projectile update | Exercised by handler, weapon, damage and script fixtures; ordinary destruction only, with no dynamic map changes |
| `actor-handlers.js`, `turrets.json`   | Explicit entry IDs in `handler-coverage.json`             | 27 handlers × 384 cases, all 30 slots and blast state compared; linked turret fixtures include five link choices |
| `actor-weapons.js`                    | E2C9–E427                                                 | Eight dispatch branches × 384 cases, all actor fields and original success flag/slot compared                    |
| `actor-collisions.js`                 | EC16, E7FE, EA5A, E861                                    | 4096 collision pool scans; 4096 simultaneous damage, shield reserve, score and high score cases                  |
| `actor-system.js`, `actor-scripts.js` | CA44, CB0E, CC0F–CC9F                                     | Ten scenarios × 256 frames × all 30 slots, including real native projectiles                                     |

The 27 handlers comprise 23 nonempty routines and four confirmed empty routines: D0C6, D16F, DF27, DF28. The remaining 37 handlers fail explicitly when dispatched. Handler counts are not a completion percentage for the game.

The eight tested enemy weapon branches use prototypes 48, 53, 56, 58, 59, 26, 172 and 95. These exercise ordinary allocation, aimed coarse/fine headings, frame-alternating weapons, fan spreads, three-shot spreads and partially exhausted pools. A failed final allocation can leave earlier shots spawned while reporting failure; this behavior is retained.

## Important behavior retained

- A script's `switchAI` constructor ends the entire object update pass for that frame. The later slots resume on the next frame. It does not simply continue to the next actor.
- Movement mode 14 deletes its scripted actor when low collision bits are nonzero; bit 7 alone does not satisfy that test.
- Original slot order matters: a projectile created in a later slot may update during the same pass.
- A linked turret can increment its body's timer, copy collision flags, and update palette fields. Burst, recovery and cooldown counters retain byte wrapping.
- A vertically overflowing relative calculation complements a byte and forces range 7. Floating-point trigonometry would change this behavior.
- For an inactive player, the original steering helper reads a named field of slot 16 (`scriptLow`). The native helper receives that value explicitly; it does not substitute a generated angle.
- DB29 scans for the existence of other active actors. It is not a hit/damage procedure.
- Both damage amounts are computed from the pre-collision energies. Destruction of the source precedes scoring and destruction of the target.

## Test isolation and limits

Handler fixtures replace terrain contact routines with explicit contact flags and deltas. They prove the handler's response, not the full terrain/cache implementation. Spawn fixtures likewise isolate the initial contact sample. The scroll-frontier condition is translated, but camera integration and full traversal have not been verified.

Damage fixtures use ordinary targets and verified empty death/drop prototypes. Pickups, equipment and transitions require explicit callbacks and fail when absent. Dynamic tile mutation, all destruction-link configurations and complete death animation chains are not yet proven.

Ten script fixtures cover movement, collision removal in speed mode 14, both range-branch outcomes, fallback activation, aim/fire, jumps, resuming a nonzero timer and ending the update pass. They are controlled scenarios; they do not prove all 192 campaign script roots or a full level.

Player cannon/machine-gun resource rules, full player health/fuel/lives handling, 37 remaining handlers, bosses, camera/route transitions, pickups, inventory/radio/passwords/ending and full campaign comparison remain unfinished. The browser preview remains a controller/map/art inspection surface; these combat modules are not presented as a finished playable game.
