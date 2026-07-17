# 🐉 Dragon Island — Game Design Document

---

## 1. High-Level Overview

| Field | Value |
|---|---|
| **Game Title** | Dragon Island |
| **Elevator Pitch** | A child-friendly top-down 2D game where you collect, care for, and battle dragons on a grass island — inspired by Stardew Valley and Dragon City. |
| **Genre** | Casual / Management / Collection / Light Strategy |
| **Target Audience** | Children aged 6–12 (designed with an 8-year-old in mind) |
| **Art Style** | 16-bit pixel art, AI-generated assets with transparency |
| **Perspective** | Top-down 2D |
| **Resolution** | 800 × 600 logical pixels |

### Core Gameplay Loop

1. **Explore** the grass island with your starter dragon "Phillis."
2. **Collect resources** — walk into trees (apples), rocks (coins).
3. **Buy or craft new dragons** using coins in the Dragon Store or collect parts from card packs.
4. **Care for dragons** — feed, pet, and monitor their Love / Hunger / Energy / HP stats.
5. **Build structures** — houses and castles that generate passive resources and defend the island.
6. **Defend against enemies** — Black Dragons spawn periodically and attack your dragons.
7. **Battle** — enter a turn-based (click-based) arena to fight opponent dragons for coin rewards.
8. **Upgrade buildings** — convert houses into Towers, Mines, or Blacksmiths.
9. **Repeat** — grow your dragon team, expand your base, and survive.

### Win Conditions

There is **no formal win condition** yet. The game is an open-ended sandbox. The implicit goal is to:
- Survive the Black Dragon attacks (avoid Game Over by keeping Phillis alive).
- Collect all 16 dragon types.
- Build and upgrade as many structures as possible.

### Current Completion Status

The game is in **Phase 1 (Minimal Playable MVP)**. Core movement, resource collection, dragon purchasing, card packs, crafting, building, combat, and enemy AI are all functional. Missing features include saving/loading, sound/music, quests, multiple islands, and deeper progression.

---

## 2. World

### Map Layout

The game world is a single **flat grass island** of 2000 × 2000 world units.

| Property | Value |
|---|---|
| World size | 2000 × 2000 pixels |
| Visual size | 4000 × 4000 tiling sprite (grass texture at 0.5× tile scale) |
| Coordinate origin | (0, 0) top-left |
| Player spawn | Center of world (1000, 1000) |
| Camera zoom | 2.0× |

### Areas / Biomes

There is only **one biome**: grass meadow. The entire world is covered with a single repeating grass tile.

### Environmental Objects

| Object | Count | Placement | Interaction |
|---|---|---|---|
| **Apple Trees** | 30 | Random positions (200–1800 range), at least 300px from center | Walk into to collect 1 apple (2-second cooldown) |
| **Rocks** | 20 | Random positions (200–1800 range), at least 300px from center | Walk into to destroy and gain 1 coin |
| **Houses** | 0 (player-built) | Spawned 80–160px from player | Solid collision, clickable for upgrades |
| **Castles** | 0 (player-built) | Spawned 100–200px from player | Solid collision, clickable for upgrades, triggers wall building |
| **Walls** | 0 (auto-generated) | Built around all buildings when a castle is placed | Solid collision, gate gap at bottom-center |

### Spawn Locations

- **Player Dragon**: Center (1000, 1000)
- **Companion Dragons**: Near center with ±100px random offset
- **Black Dragons (Enemies)**: Random position at least 400px from player, within world bounds (200–1800)

### World Boundaries

Physics world bounds are set to (0, 0, 2000, 2000). All sprites with `collideWorldBounds` enabled cannot leave this area.

### Weather / Time of Day

**Not implemented.** The world has no weather effects, lighting changes, or day-night cycle.

---

## 3. Player / Dragon

The **player IS the dragon**. There is no separate human avatar. The first dragon in the player's collection ("Phillis") serves as the player character.

### Controls

| Input | Action |
|---|---|
| **Click/Tap on dragon** | Opens the Dragon Menu for that dragon |
| **Click/Tap on black dragon** | Attack the black dragon (melee range ≤250px) |
| **Click/Tap on house/castle** | Opens House Upgrade Menu |
| **Click/Tap on tree** | Walk overlap → collect apple |
| **Click/Tap on rock** | Walk overlap → destroy rock, gain coin |
| **UI buttons** | Backpack, Cart, Craft, Build, Smile (see UI section) |

> **Note:** The player does NOT directly control movement using keyboard or click-to-move. Dragons move autonomously — companions follow the player dragon, and there is **no explicit player movement input implemented**. The player dragon currently has no direct movement controls. Movement relies on physics overlaps triggered by proximity. This is a **known gap**.

### Camera Behavior

- Camera follows the player dragon (Phillis) with smooth lerp (0.1, 0.1).
- Camera is bounded to world (0, 0, 2000, 2000).
- Camera zoom is 2.0×.

---

## 4. Dragons

### Starter Dragon

| Field | Value |
|---|---|
| Name | Phillis |
| Texture key | `dragon` |
| Scale | 0.08 |
| Starting Stats | Love: 20, Hunger: 80, Energy: 100, HP: 100, Level: 1, XP: 0 |

### All Dragon Types (16 total)

| # | Name | Texture Key | Store Cost (Coins) |
|---|---|---|---|
| 1 | Phillis (Starter) | `dragon` | — (free) |
| 2 | Fire Dragon | `dragon_fire` | 20 |
| 3 | Ice Dragon | `dragon_ice` | 30 |
| 4 | Thunder Dragon | `dragon_storm` | 40 |
| 5 | Water Dragon | `dragon_water` | 50 |
| 6 | Stone Dragon | `dragon_stone` | 60 |
| 7 | Poison Dragon | `dragon_poison` | 70 |
| 8 | Plant Dragon | `dragon_plant` | 80 |
| 9 | Soda Dragon | `dragon_soda` | 90 |
| 10 | Sand Dragon | `dragon_sand` | 100 |
| 11 | Metal Dragon | `dragon_metal` | 110 |
| 12 | Paper Dragon | `dragon_paper` | 120 |
| 13 | Glass Dragon | `dragon_glass` | 130 |
| 14 | Jacket Dragon | `dragon_jacket` | 140 |
| 15 | Diamond Dragon | `dragon_diamond` | 150 |
| 16 | Light Dragon | `dragon_light` | 160 |
| 17 | Coffee Dragon | `dragon_coffee` | 170 |

### Dragon Stats

Every owned dragon has the following stats object:

```
{
  love: 0–100,      // Increased by petting (+5)
  hunger: 0–100,    // Increased by feeding (+15), decays over time (-1 every 15s)
  energy: 0–100,    // Decays over time (-1 every 15s), consumed by fighting (-20)
  hp: 0–100,        // Health. Decreased by enemy attacks (-10). Increased by feeding (+15) and petting (+15)
  level: 1+,        // Integer level, increases when XP ≥ 100
  xp: 0–99          // Experience points, gained from fighting (+35)
}
```

### Dragon Behaviors

#### Companion Follow AI (update loop)
- If distance to player dragon > 120px: Move toward player at speed 90.
- If distance < 60px: Move away to prevent overlap at speed 40.
- Between 60–120px: Stay still (idle zone).
- Sprite flips horizontally based on velocity direction.

#### Interactions

| Action | Effect |
|---|---|
| **Feed** | Costs 1 apple. Hunger +15, HP +15 |
| **Pet** | Love +5, HP +15. Triggers squash/stretch animation and floating hearts |
| **Fight** | Opens fighter selection → Battle Arena (see Combat) |
| **Status** | Opens status page showing stat bars |

### Dragon Appearance

- All dragons are single static PNG images (no spritesheet animation).
- Rendered at 0.08 scale in the world and various smaller scales in menus.
- Each dragon type has a distinct color/element theme.

---

## 5. Enemies

### Black Dragon

| Field | Value |
|---|---|
| **Name** | Black Dragon |
| **Appearance** | Same dragon sprite as Phillis but tinted dark (`0x222222`) |
| **Health** | 100 HP |
| **Max Count** | 4 active at once |
| **Spawn Rate** | 2 initially after 2 seconds, then 1 every 25 seconds |
| **Spawn Distance** | At least 400px from player |
| **Aggro Range** | 400px |
| **Chase Speed** | 55 |
| **Attack Cooldown** | 3 seconds |
| **Damage Dealt** | 10 HP per attack |
| **Player Attack Damage** | 35 HP per click |
| **Player Attack Range** | 250px |
| **Loot on Defeat** | +3 coins |
| **Death Animation** | Fade out + shrink + spin 180° over 500ms |

#### Black Dragon AI (per-frame update)

1. Find closest friendly dragon within 400px.
2. If found:
   - If distance > 55px: Chase at speed 55.
   - If distance < 45px: Back off at speed 30.
   - If between 45–55px: Stop (idle attack position).
   - If distance < 60px and attack cooldown elapsed (3s): Attack.
3. If no dragon nearby: Roam randomly (change direction every 3 seconds, speed ±30).

#### Black Dragon Attack Pattern

1. Lunging tween toward target (100ms).
2. Fires a fireball projectile that tweens to target position (250ms).
3. On hit: Target shakes, -10 HP, floating damage text.
4. If primary dragon (Phillis) HP reaches 0 → **Game Over**.

---

## 6. NPCs

**There are no NPCs** in the current version. No shopkeepers, quest givers, or dialogue characters exist. The shop is UI-only.

---

## 7. Items

### Resources

| Item | Icon Key | How Obtained | Purpose |
|---|---|---|---|
| **Apples** | `apple` | Walk into trees (2s cooldown), Apple card on dragon | Feed dragons (+15 Hunger, +15 HP) |
| **Coins** | `coin` | Destroy rocks (+1), Defeat black dragons (+3), Win battles (+10), Mine upgrade (+1/5s) | Buy dragons, buy packs, upgrade buildings |
| **Wood** | `tree` | Tree card on dragon (+1/5s for 60s), Blacksmith upgrade (+1/5s) | Build houses (cost 3), upgrade buildings |
| **Fish** | `fishing_rod` | Fishing Rod card on dragon (+1/5s for 60s) | Build houses (cost 1) |
| **Stone** | `rock` | Mine upgrade (+1/5s) | Build castles (cost 10) |

### Cards (from Packs)

Cards are obtained by opening **Dragon Booster Packs** (cost: 10 coins, yields 3 random cards).

| Card Name | Type | Key | Effect |
|---|---|---|---|
| Delicious Food | Food | `apple` | Give to dragon → generates +1 apple every 5s for 60s |
| Ancient Tree | Trees | `tree` | Give to dragon → generates +1 wood every 5s for 60s |
| Fishing Rod | Fishing | `fishing_rod` | Give to dragon → generates +1 fish every 5s for 60s |
| Apple Seeds | Farming | `apple` | Give to dragon → generates +1 apple every 5s for 60s |
| Dragon Head | Part | `part_head` | Crafting part — combine all 4 parts to craft a random dragon |
| Dragon Wings | Part | `part_wings` | Crafting part |
| Dragon Tail | Part | `part_tail` | Crafting part |
| Dragon Body | Part | `part_body` | Crafting part |

### Card Mechanics

- Cards are collected into `ownedCards` array.
- In the Crafting Center, cards can be:
  - **Given to a dragon**: Food/Trees/Fishing/Farming cards produce resources over time.
  - **Connected**: Two Part or Combo cards merge into a Combo (no duplicate parts). When all 4 parts merge, a random dragon is auto-crafted.

---

## 8. Progression

### Economy

| Resource | Generation Rate | Sinks |
|---|---|---|
| Coins | Rocks (+1), Enemies (+3), Battles (+10), Mine (+1/5s) | Dragon Store (20–170), Packs (10), Upgrades (5–10) |
| Apples | Trees (+1/2s cooldown), Food/Farming cards (+1/5s × 12) | Feeding dragons |
| Wood | Tree cards (+1/5s × 12), Blacksmith (+1/5s) | House (3), Upgrades (10–20) |
| Fish | Fishing cards (+1/5s × 12) | House (1) |
| Stone | Mine (+1/5s) | Castle (10) |

### Dragon Leveling

- XP is gained from the "Fight" action in the Dragon Menu (+35 XP, costs 20 Energy).
- At 100 XP → Level up (XP resets to XP - 100).
- Leveling currently has **no gameplay effect** (no stat boosts, no new abilities).

### Stat Decay

- Every 15 seconds, ALL owned dragons lose:
  - Hunger: -1
  - Energy: -1

### Game Over Condition

If the primary dragon Phillis reaches 0 HP from enemy attacks → Game Over screen appears → "TRY AGAIN" restarts both MainScene and UIScene from scratch.

---

## 9. UI Screens

### HUD (Always Visible)

| Element | Position | Purpose |
|---|---|---|
| **Backpack icon** | Top-right (750, 60) | Opens Inventory window |
| **Cart icon** | Right (750, 390) | Opens Dragon Store |
| **Craft button (⚒️)** | Right (750, 460) | Opens Crafting Center |
| **Build button (🏗️)** | Right (750, 530) | Opens Construction Hub |
| **Smile button (😊)** | Top-left (50, 50) | Transitions to the Black Room scene |

### Inventory Window

- Toggle: Click backpack icon.
- Shows: Apples count, Coins count (gold), Wood count, Stone count, Fish count.
- Each resource has an icon and text display.

### Dragon Store

- Toggle: Click cart icon.
- Grid layout: 8 columns × 2 rows showing all 16 purchasable dragon types.
- Each item shows: Dragon image, name, cost in coins, BUY/OWNED button.
- "PACK" button in top-right navigates to Pack Store.

### Pack Store

- Accessed from Dragon Store.
- Shows Dragon Booster Pack image and "OPEN PACK" button (10 coins).
- Opening a pack shows a reveal screen with 3 animated cards.
- "COLLECT ALL" button adds cards to inventory.

### Dragon Menu

- Toggle: Click on any owned dragon in the world.
- Options: Feed, Pet, Fight, Status, Close.

### Status Page

- Toggle: From Dragon Menu → Status.
- Shows: Level, Love bar (pink), Hunger bar (orange), Energy bar (cyan), HP bar (red).
- All bars are 200px wide, fill proportionally.

### Fighter Selection (2-step)

1. **Select Opponent**: Grid of 15 dragon types to fight against.
2. **Build Your Team**: 3 slots to assign owned dragons, then START BATTLE.

### Battle Arena

- Full-screen scene with arena background.
- Player dragon (left) vs. Opponent dragon (right).
- Click your dragon to attack (fireball projectile, 10 damage).
- Opponent auto-attacks every 2–5 seconds.
- HP bars above each dragon.
- Defeated dragons can be swapped (up to 3 team members).
- Victory: +10 coins. Defeat: No penalty.
- "Return to Island" button available.

### Crafting Center

- Toggle: Click craft button (⚒️).
- Shows all owned cards in a grid.
- Click a card to select it (yellow border), click another Part/Combo card to connect them.
- Shows owned dragons at bottom — click a dragon while a card is selected to give the card to that dragon.
- "CRAFT NEW DRAGON" button appears when all 4 parts are owned.

### Construction Hub

- Toggle: Click build button (🏗️).
- Two build options:
  - **Dragon House**: 3 Wood + 1 Fish → spawns a house near the player.
  - **Castle**: 10 Stone → spawns a castle near the player + auto-builds walls around all buildings.

### House Upgrade Menu

- Toggle: Click any placed house/castle in the world.
- If not upgraded: Shows 3 upgrade options (Tower, Mine, Blacksmith).
- If already upgraded: Shows current status.

| Upgrade | Cost | Effect |
|---|---|---|
| Tower | 10 Wood, 5 Coins | Auto-shoots gold arrows at black dragons within 400px range (20 damage, every 2.5s) |
| Mine | 15 Wood, 5 Coins | Generates +1 Stone every 5 seconds |
| Blacksmith | 20 Wood, 10 Coins | Generates +1 Wood every 5 seconds |

### Game Over Screen

- Dark overlay with "GAME OVER" title, "Phillis has fainted!" subtitle.
- "TRY AGAIN" button restarts the game.

### Black Room Scene

- Accessed via the Smile button (😊) in top-left.
- Pure black screen with floating dust mote particles.
- Faint center glow circle.
- "..." text fades in.
- "← Go Back" button appears after delay.
- An atmospheric / secret room. Currently has no gameplay function.

---

## 10. Audio

**No audio is implemented.** There is no music, sound effects, ambient sounds, or voice lines in the current version.

### Suggested Audio (for recreation):

| Category | Suggestions |
|---|---|
| Background Music | Calm, whimsical loop (Stardew Valley style) for overworld |
| Battle Music | Upbeat, energetic loop for Battle Arena |
| SFX: Collect Apple | Soft "pop" or "crunch" |
| SFX: Break Rock | Stone cracking sound |
| SFX: Dragon Spawn | Magical shimmer |
| SFX: Fireball | Whoosh + impact |
| SFX: Building Complete | Hammer hit / construction sound |
| SFX: Level Up | Triumphant jingle |
| SFX: Game Over | Somber tone |
| SFX: Pack Opening | Card flip / reveal sound |
| SFX: UI Click | Subtle button press |
| Ambient | Birds, wind, gentle nature |

---

## 11. Art Direction

### Visual Style

- **16-bit pixel art** aesthetic.
- AI-generated assets processed for transparency.
- Each dragon is a full-body side-view illustration on a transparent background.
- UI uses monospace font ("Courier New") for a retro-tech feel.

### Color Palette

| Element | Color |
|---|---|
| Grass / Background | `#5c9634` (natural green) |
| Web page background | `#2d2d2d` (dark gray) |
| UI backgrounds | `#000000` with 0.8–0.95 alpha |
| UI borders | Gold (`#d4af37`), Neon green (`#00ff00`), Cyan (`#00ffff`), Red (`#ff0000`), Purple (`#9b59b6`), Blue (`#4a90e2`) |
| Coin text | Gold (`#FFD700`) |
| HP bar | Red (`#ff3333`) |
| Energy bar | Cyan (`#00ffff`) |
| Hunger bar | Orange (`#ffa500`) |
| Love bar | Pink (`#ff69b4`) |

### Mood & Inspiration

- **Stardew Valley**: Cozy, peaceful exploration and farming.
- **Dragon City**: Collecting and managing multiple dragon types.
- Child-safe, non-violent feel (combat exists but is gentle with floating number indicators rather than gore).

### Scale

- Dragons render at 0.08 scale (original images are large AI-generated PNGs ~1024×1024).
- Trees: 0.15 scale.
- Rocks: 0.15 scale.
- Houses: 0.2 scale.
- Castles: 0.15 scale.
- Walls: Dynamically scaled to 40×40 display size.

---

## 12. Gameplay Walkthrough (Full Play Session)

### Starting a New Game

1. Game loads. BootScene preloads all assets, then transitions to MainScene.
2. MainScene creates the grass world (4000×4000 tiled).
3. Phillis (the starter dragon) spawns at center (1000, 1000).
4. 30 apple trees and 20 rocks are scattered across the world.
5. Camera follows Phillis at 2× zoom.
6. UIScene launches as an overlay with all HUD elements.
7. After 2 seconds, 2 Black Dragons spawn at random distant positions.

### Early Game

8. The player explores the world. Walking Phillis into trees collects apples (1 every 2 seconds). Walking into rocks destroys them for coins.
9. Black Dragons begin roaming. When one gets within 400px of Phillis, it starts chasing.
10. The player can click a Black Dragon within 250px to attack it (35 damage). After ~3 hits it dies, dropping 3 coins.
11. Meanwhile, every 25 seconds a new Black Dragon spawns (up to 4).
12. The player opens the Backpack to see their apple/coin/resource counts.

### Dragon Collection

13. Once the player has enough coins, they open the Dragon Store (cart icon).
14. They purchase a Fire Dragon for 20 coins. It spawns near Phillis and begins following.
15. Clicking any owned dragon opens the Dragon Menu. The player can:
    - **Feed** (costs 1 apple, restores Hunger and HP).
    - **Pet** (increases Love and HP, shows heart animation).
    - **Check Status** (see stat bars).

### Card Packs & Crafting

16. With 10 coins, the player opens a Dragon Booster Pack from the Pack Store.
17. Three random cards are revealed. The player collects them.
18. In the Crafting Center (⚒️), the player can:
    - Select a Food/Tree/Fishing card and give it to a dragon → that dragon generates resources over time.
    - Combine Dragon Part cards (Head + Wings → Combo, + Tail + Body → full dragon crafted).

### Building

19. With 3 Wood + 1 Fish, the player builds a Dragon House via the Construction Hub.
20. A house appears near the player. Clicking it opens the Upgrade menu.
21. With enough Wood and Coins, the player upgrades to:
    - **Tower**: Auto-defends against Black Dragons.
    - **Mine**: Generates passive Stone.
    - **Blacksmith**: Generates passive Wood.
22. With 10 Stone, the player can build a **Castle**, which also auto-builds defensive walls around all buildings.

### Battle Arena

23. From the Dragon Menu → Fight, the player selects an opponent dragon type.
24. They build a team of up to 3 dragons.
25. In the Battle Arena, they click their dragon to launch fireballs at the opponent (10 damage per hit).
26. The opponent auto-attacks every 2–5 seconds.
27. If a dragon faints, the next team member swaps in.
28. Victory awards 10 coins. Defeat has no penalty.

### Stat Decay & Survival

29. Every 15 seconds, all dragons lose 1 Hunger and 1 Energy.
30. If Black Dragons reduce Phillis to 0 HP → Game Over. The player can "TRY AGAIN" to restart.

### Secret Room

31. Clicking the Smile button (😊) in the top-left transitions to the Black Room — a mysterious dark room with floating dust particles. Currently a placeholder/easter egg.

### End of Content

The game currently has no formal ending. The player can continue collecting dragons, building structures, and fighting indefinitely.
