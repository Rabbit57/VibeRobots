# Vibe Robots rules source audit

This project targets the Avalon Hill 2005 ruleset. It reproduces game facts and procedures, not protected presentation: all player-facing explanations are paraphrased and no scan, logo, card face, commercial miniature, or promotional image ships with the game.

## Source precedence

1. **R2005** — [archived Avalon Hill 2005 rulebook](https://desktopgames.com.ua/games/381/roborally_rules_en.pdf), the primary source for turn structure, deck composition, damage, lives, power-downs, board elements, repair, checkpoints, archives, and course setup.
2. **FAQ** — [official Wizards Robo Rally FAQ](https://media.wizards.com/2015/faq/Robo_Rally_FAQ.pdf), used to resolve simultaneous respawns, Mechanical Arm ties, and ambiguous edge cases.
3. **ENT** — [Entropia’s 2005 Option reference](https://entropia.de/RoboRally), an independent transcription/translation containing identifiers, timing, and effects.
4. **ALEX** — [The Alexandrian Ultimate Collection reference](https://www.thealexandrian.net/creations/roborally/roborally-ultimate-collection-rulebook.pdf), an independent consolidated reference containing the same Option names and mechanics.

Conflicts are resolved R2005 → FAQ → agreement between ENT and ALEX. “Corroborated” below means both independent descriptions agree on the implemented behavior; release remains blocked if a future source comparison changes that status.

## Core mechanics matrix

| Area | Source | Implementation | Status |
|---|---|---|---|
| Shared 84-card Program deck and priorities | R2005 pp. 3, 7 | `game/content/programs.ts` | Verified |
| Five registers, priority order, 30-second final-player timer | R2005 pp. 7–9 | `game/engine.ts`, `worker/index.ts` | Verified |
| Robot movement, pushing, walls, pits, off-board destruction | R2005 pp. 10–11 | `game/engine.ts` | Verified |
| Express/normal conveyors, pushers, gears, lasers, sites | R2005 pp. 12–15 | `game/engine.ts` | Verified |
| Damage and locked registers | R2005 pp. 16–17 | `game/engine.ts` | Verified |
| Power-down and repair | R2005 pp. 17–18 | `game/engine.ts` | Verified |
| Lives, archives, respawn, elimination | R2005 pp. 18–19; FAQ | `game/engine.ts` | Verified |
| Checkpoints in order and victory | R2005 pp. 15, 19 | `game/engine.ts` | Verified |
| Option acquisition on wrench-and-hammer sites, with one repair | R2005 p. 15 | `game/engine.ts` | Verified |
| Risky Exchange / Exchange | R2005 course manual | `game/content/boards.ts` | Geometry encoded |
| Dizzy Dash / Spin Zone | R2005 course manual | `game/content/boards.ts` | Geometry encoded |
| Against the Grain / Chess + Chop Shop | R2005 course manual | `game/content/boards.ts` | Geometry encoded |

## Option audit matrix

The shipped deck has exactly one entry for each row. Text in the UI is newly written.

| Option | Timing / implemented behavior | Corroboration | Status |
|---|---|---|---|
| Ablative Coat | Damage; absorbs next 3 points, then is discarded | ENT + ALEX | Corroborated |
| Abort Switch | Run time; current and later registers become random | ENT + ALEX | Corroborated |
| Brakes | Run time; Move 1 may become Move 0 | ENT + ALEX | Corroborated |
| Circuit Breaker | End of turn; 3+ damage schedules power-down | ENT + ALEX | Corroborated |
| Conditional Program | Programming; store and substitute one spare card | ENT + ALEX | Corroborated |
| Double Barrel Laser | Main laser modification; two forward damage | ENT + ALEX | Corroborated |
| Extra Memory | Deal one additional Program card | ENT + ALEX | Corroborated |
| Fire Control | Main laser modification; target a register or Option after damage | ENT + ALEX | Corroborated |
| Flywheel | Programming; retain one unused card for a later turn | ENT + ALEX | Corroborated |
| Fourth Gear | Run time; Move 3 may move four spaces | ENT + ALEX | Corroborated |
| Gyroscopic Stabilizer | Turn programmed; ignore gear/belt rotations | ENT + ALEX | Corroborated |
| High Power Laser | Main laser penetrates one wall or robot | ENT + ALEX | Corroborated |
| Mechanical Arm | Run time; touch an adjacent checkpoint through an open edge | ENT + ALEX + FAQ | Corroborated |
| Mini Howitzer | Optional weapon; damage + push, payload 5 | ENT + ALEX | Corroborated |
| Power-Down Shield | Power-down; prevent one point per register phase | ENT + ALEX | Corroborated |
| Pressor Beam | Optional weapon; push target one space away | ENT + ALEX | Corroborated |
| Radio Control | Optional weapon; copy program to target within range | ENT + ALEX | Corroborated |
| Ramming Gear | Movement; pushed robot takes damage | ENT + ALEX | Corroborated |
| Rear Laser | Robot laser phase; also fires backward | ENT + ALEX | Corroborated |
| Recompile | Programming; redraw hand once and take 1 damage | ENT + ALEX | Corroborated |
| Reverse Gears | Run time; Back Up may move two spaces | ENT + ALEX | Corroborated |
| Scrambler | Optional weapon; randomize target’s next register | ENT + ALEX | Corroborated |
| Shield | Turn programmed; prevent 1 damage/register from chosen side | ENT + ALEX | Corroborated |
| Superior Archive Copy | Respawn; waive the replacement robot’s two damage | ENT + ALEX | Corroborated |
| Tractor Beam | Optional weapon; pull a non-adjacent target one space | ENT + ALEX | Corroborated |
| Turret | Turn programmed; choose main laser facing | ENT + ALEX | Corroborated |

## Intentional launch exclusions

Team modes, SuperBot/two-robot scenarios, other special courses, the four remaining board faces, AI, spectators, matchmaking, and a course editor are not part of the launch rules surface. These exclusions never change the physics of the included standard courses.
