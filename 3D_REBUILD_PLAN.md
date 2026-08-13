# 🐉 Dragon Island 3D — Rebuild Plan & Implementation Batches

This is the working plan for rebuilding Dragon Island as a **fully 3D** browser game.
Each batch below is a self-contained work session: give Claude the batch's prompt,
verify the "Done when" checklist in the browser, then move to the next batch.

---

## Decisions (locked in)

| Decision | Choice |
|---|---|
| Renderer | **Three.js** (npm dependency, same Vite workflow) |
| UI | **HTML/CSS overlays** on top of the 3D canvas (not in-engine UI) |
| Dragons | **One procedural low-poly dragon** built from geometry in code; each of the 16+ elements is a config entry (colors, material, glow, accessories) |
| Animation | **Procedural** (sine-wave wing flaps, idle bob, walk cycle) — same code-driven philosophy as the 2D game's tweens |
| Approach | **Fresh rebuild from the design docs** — the 2D Phaser game stays untouched as the reference implementation |
| Location | New code in `src3d/`, new entry point `index3d.html` (`npm run dev` serves both) |

## Source-of-truth documents

- [GAME_DESIGN.md](GAME_DESIGN.md) — world, dragons, items, progression, every UI screen
- [GAMEPLAY_SYSTEMS.md](GAMEPLAY_SYSTEMS.md) — exact mechanics: harvesting, packs, crafting rules, wall algorithm, combat
- [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) — state model, event manifest, timers, **JSON save schema**
- [AI_HANDOFF.md](AI_HANDOFF.md) — rebuild priorities and pitfalls (⚠ the 2D game lacked player movement controls — the 3D version must have them from day one)
- [TODO_AND_BUGS.md](TODO_AND_BUGS.md) — known bugs to NOT reproduce (e.g. apple-tree overlap rapid collection)
- 2D source in `src/` — consult for exact numbers (prices, decay rates, damage) when the docs are ambiguous

---

## Batch 1 — Scaffold & World Shell

**Goal:** A 3D island you can look at, running alongside the 2D game.

- Add `three` to package.json. Create `index3d.html` + `src3d/main.js` (Vite multi-page).
- Renderer, scene, lighting (hemisphere + directional sun with shadows), sky color.
- 2000×2000 ground plane with a grassy look; simple water or edge treatment at the world border.
- Third-person camera rig (fixed follow angle, slight mouse orbit allowed) pointed at a placeholder capsule "player".
- Scatter placeholder trees/rocks (cones + icosahedrons) per the spawn rules in GAME_DESIGN.md §2.

**Done when:** `npm run dev` → `/index3d.html` shows a lit 3D island with placeholder scenery at a steady 60 fps, and the original 2D game still works at `/`.

**Prompt:** *"Do Batch 1 of 3D_REBUILD_PLAN.md — scaffold the Three.js entry point and world shell."*

---

## Batch 2 — Procedural Dragon Factory

**Goal:** Every dragon type in the game exists as a 3D creature.

- `src3d/dragons/DragonFactory.js`: one parameterized low-poly dragon assembled from geometry (body, head, snout, horns, wings, tail, legs).
- `src3d/data/dragonTypes.js`: config for **all dragon types** listed in GAME_DESIGN.md §4 plus later additions in the 2D code (fire, ice, stone, soda, sand, metal, paper, diamond, glass, jacket, light, coffee, black/enemy, …). Each entry: name, colors, material style (emissive lava, transparent glass/ice, metallic chrome, matte), scale, optional accessory meshes (jacket, coffee mug, etc.), shop price, element.
- Procedural animation clips driven in the update loop: idle (bob + slow wing sway), walk (leg/tail motion), fly/flap, attack lunge, hurt flash.
- **Dragon gallery debug page**: a grid showing every dragon type idling, for visual review.

**Done when:** the gallery page shows all dragon types, each visually distinct and animating; picking any type is one config object.

**Prompt:** *"Do Batch 2 of 3D_REBUILD_PLAN.md — build the procedural dragon factory, all element skins, animations, and the gallery page."*

---

## Batch 3 — Player Control & Companions

**Goal:** You ARE a dragon walking around the island.

- Replace the placeholder capsule with the starter dragon (GAME_DESIGN.md §4 "Starter Dragon").
- **WASD/arrow movement + click-to-move** (both — the handoff doc is explicit that controls were the 2D game's biggest gap). Dragon turns toward movement direction, plays walk animation, idles when stopped.
- Camera follows smoothly; world-boundary clamping.
- Companion follow AI: owned dragons trail the player, keeping minimum separation (no stacking), per AI_HANDOFF.md Phase 1.
- Collision blocking against trees/rocks/buildings (simple radius checks are fine).

**Done when:** you can walk/click the starter dragon anywhere on the island with 2 test companions following naturally.

**Prompt:** *"Do Batch 3 of 3D_REBUILD_PLAN.md — player movement, camera follow, and companion AI."*

---

## Batch 4 — Game State, Stats & HUD

**Goal:** The caretaking core (the "must keep" system) is alive.

- `src3d/state/GameState.js`: central plain-JS state per TECHNICAL_ARCHITECTURE.md §3 (resources, owned dragons, structures) with a simple event emitter matching its event manifest.
- Per-dragon stats: **HP, Hunger, Energy, Love** with decay timers per TECHNICAL_ARCHITECTURE.md §4 / GAME_DESIGN.md §8 (copy exact rates from the 2D code).
- Feeding (apples restore hunger), resting, petting/love interactions.
- HTML/CSS HUD overlay: coin/apple/stone counters, selected-dragon stat bars, backpack button. Style it chunky and kid-friendly per GAME_DESIGN.md §11.

**Done when:** stats visibly decay over time, feeding an apple restores hunger, and the HUD updates live.

**Prompt:** *"Do Batch 4 of 3D_REBUILD_PLAN.md — game state, stat decay, feeding, and the HTML HUD."*

---

## Batch 5 — Resources & Harvesting

**Goal:** The gather loop works.

- Replace placeholder scenery with nicer low-poly trees (apple-bearing) and rocks.
- Walk-into / click-to-harvest: apples from trees, coins, stone from rocks — mechanics per GAMEPLAY_SYSTEMS.md §1, including respawn timers.
- Fix known bug #2 from TODO_AND_BUGS.md: overlapping trees must not allow rapid multi-collection (add per-tree cooldown).
- Backpack/inventory window (HTML overlay) listing resources.
- Small juice: harvest pop animation, floating "+1 🍎" text.

**Done when:** you can harvest apples/coins/stone, counts persist in state, backpack shows them, no double-collection exploit.

**Prompt:** *"Do Batch 5 of 3D_REBUILD_PLAN.md — resource nodes, harvesting, respawn, and the backpack."*

---

## Batch 6 — Dragon Store & Pack Store

**Goal:** Spend coins, grow the family.

- Dragon Store overlay per GAME_DESIGN.md §9: grid of all purchasable dragons (rendered as live 3D thumbnails or canvas snapshots from the factory), prices from the 2D data.
- Buying spawns the dragon in-world; it joins the companion follow chain.
- Pack Store: buy booster packs; card reveal animation per GAMEPLAY_SYSTEMS.md §2 (3D card flip is a nice touch).
- Cards go into the backpack as a collection.

**Done when:** coins buy dragons that appear and follow you; packs open with a reveal and cards land in inventory.

**Prompt:** *"Do Batch 6 of 3D_REBUILD_PLAN.md — dragon store, pack store, and card reveal."*

---

## Batch 7 — Card Crafting Center

**Goal:** Combine cards into dragons and gear.

- Crafting Center overlay per GAMEPLAY_SYSTEMS.md §3: drag-and-drop (or click-to-select sequence) card connections, connection rules, and auto-crafting behavior, recipes copied from the 2D code.
- Crafted dragons spawn in-world; card consumption and failure cases handled.
- Give-card-to-dragon interactions where the 2D game supports them.

**Done when:** every recipe from the 2D game works end-to-end in the 3D version.

**Prompt:** *"Do Batch 7 of 3D_REBUILD_PLAN.md — the card crafting center with all recipes."*

---

## Batch 8 — Construction & Castle Walls

**Goal:** Build and upgrade a home base.

- Construction Hub overlay per GAME_DESIGN.md §9; placement mode: ghost mesh follows the ground, click to place, stone/coin costs.
- Structures as low-poly 3D models: house (+ upgrade path), tower, mine, blacksmith, castle — upgrade paths per GAMEPLAY_SYSTEMS.md §4.
- **Defensive wall algorithm**: auto-generate wall segments forming a ring/bounding box around placed buildings, per GAMEPLAY_SYSTEMS.md §4 (this is a "must keep" system).
- Mine/blacksmith passive production timers per TECHNICAL_ARCHITECTURE.md §4.

**Done when:** you can place all structures, walls auto-ring the base, and production buildings generate resources over time.

**Prompt:** *"Do Batch 8 of 3D_REBUILD_PLAN.md — construction, upgrades, and the castle wall algorithm."*

---

## Batch 9 — Overworld Combat

**Goal:** Danger on the island.

- Black Dragon enemies: spawn rules + state machine (Roam → Aggro Chase → Projectile Attack) per GAME_DESIGN.md §5.
- **Elemental projectiles**: replace the single generic fireball with per-element visuals (ice bolt, stone boulder, fire ball…) as AI_HANDOFF.md suggests — glowing meshes + particle trail.
- Player/companion HP damage, hurt flash, death handling; walls block enemies; **tower auto-fires arrows** at enemies in range.
- Game Over overlay per GAME_DESIGN.md §8/§9 with restart.

**Done when:** black dragons roam, chase, and shoot; towers and walls defend the base; dying shows game over.

**Prompt:** *"Do Batch 9 of 3D_REBUILD_PLAN.md — Black Dragon AI, elemental projectiles, defense, and game over."*

---

## Batch 10 — Battle Arena

**Goal:** The dedicated fight mode.

- Fighter Selection (2-step) flow per GAME_DESIGN.md §9, then transition to a separate arena 3D scene (own camera + lighting, crowd/props optional).
- Turn-based click combat per GAMEPLAY_SYSTEMS.md §5: pick your team, click to attack with projectile animations, automated opponent attacks, HP bars, win/lose + rewards.
- Opponent roster from the 2D fight selection data.

**Done when:** a full arena battle plays out — select fighters, fight, win/lose, collect reward, return to island.

**Prompt:** *"Do Batch 10 of 3D_REBUILD_PLAN.md — the battle arena scene and turn-based combat."*

---

## Batch 11 — Save System & Polish

**Goal:** A finished-feeling game.

- **Save/load to localStorage** using the JSON schema in TECHNICAL_ARCHITECTURE.md §5 (auto-save on interval + on tab close; load on boot; "new game" reset).
- Day/night cycle (sun animation) — listed under GAME_DESIGN.md §2 weather/time.
- Sound effects + music per GAME_DESIGN.md §10 suggestions (small royalty-free set or WebAudio-synthesized).
- The **Black Room** secret scene, reimagined in 3D (optional easter egg per AI_HANDOFF.md).
- Performance pass (instanced meshes for trees/rocks/walls, shadow tuning) + mobile-width HUD check.

**Done when:** refresh restores your island exactly; the game has sound, a day cycle, and holds 60 fps late-game.

**Prompt:** *"Do Batch 11 of 3D_REBUILD_PLAN.md — save/load, day-night, audio, black room, and performance."*

---

## Working rules for every batch

1. Read this file plus the design docs referenced in the batch **before** writing code.
2. Never modify the 2D game (`src/`, `index.html`) except to read numbers from it.
3. Copy exact values (prices, decay rates, damage, recipes) from the 2D source when docs and code disagree — the code wins.
4. End every batch with the game runnable via `npm run dev` and the batch's "Done when" list verified in the browser.
5. Update the checklist below when a batch is finished.

## Progress

- [x] Batch 1 — Scaffold & World Shell
- [x] Batch 2 — Procedural Dragon Factory
- [x] Batch 3 — Player Control & Companions
- [x] Batch 4 — Game State, Stats & HUD
- [x] Batch 5 — Resources & Harvesting
- [x] Batch 6 — Dragon Store & Pack Store
- [x] Batch 7 — Card Crafting Center
- [x] Batch 8 — Construction & Castle Walls
- [x] Batch 9 — Overworld Combat
- [ ] Batch 10 — Battle Arena
- [ ] Batch 11 — Save System & Polish
