# 🤖 AI Handoff & Rebuild Instructions

---

## 1. Directory Structure Overview

If you are recreating this project, this is the layout of the reference codebase:

```
Phillis Dragon Game/
├── public/
│   └── assets/              # Raw PNG graphic textures, cards, backgrounds
├── src/
│   ├── scenes/
│   │   ├── BootScene.js     # Resource preloader context
│   │   ├── MainScene.js     # Overworld, physics, Spawning, AI updates
│   │   ├── UIScene.js       # Core HUD overlays and menus
│   │   ├── BattleScene.js   # Turn-based click combat arena
│   │   └── BlackRoomScene.js# Atmospheric secret room
│   └── main.js              # Entry point configuring the engine container
├── index.html               # Main page bootstrap
├── style.css                # Simple page layouts and canvas borders
└── package.json             # Jimp & Phaser dependencies configured
```

---

## 2. Rebuild Priority Checklist

When recreating this game from scratch (e.g. in Unity, Godot, React, or custom HTML5), prioritize implementation of these elements in order:

### Phase 1: Core Physics & Movement (Critical)
1. **World Mapping**: Set up a tiling grassy surface of 2000 × 2000 units. Bounded camera.
2. **Player Controls**: Define a player dragon character. **Implement direct player control** (WASD/Arrow keys or direct mouse click-to-move pathfinding) first.
3. **Companion Follow AI**: Add follower behavior for subsequent team dragons (move close but keep a minimum separation distance).

### Phase 2: Resource Harvesting & Spawning
4. **Trees & Rocks**: Spawn resources randomly away from the center. Set collision triggers to add apples and coins.
5. **Dragon Store**: Implement a store menu loading all dragon types.
6. **Enemy AI**: Build spawning rules for Black Dragons. Write simple state updates (Roam → Aggro Chase → Projectile Attack).

### Phase 3: Card Systems & Placement
7. **Packs**: Set up pack drawing logic.
8. **Connection UI**: Provide a crafting interface capable of detecting drag-and-drop connections or sequential selections to merge parts or give cards to dragons.
9. **Construction**: Implement structure placement and the defensive wall bounding box generation algorithm. Upgradable paths (Tower, Mine, Blacksmith).

### Phase 4: Battle Arena
10. **Combat Arena**: Build a dedicated battle layout screen. Implement team selection, clicking to attack, projectile tweens, and automated opponent attacks.

---

## 3. Assumptions to Avoid

- **Do NOT assume standard spritesheets are used**: All animation is generated via code-driven tweens, scaling modifications, and rotation updates.
- **Do NOT assume there is direct movement in the reference code**: The original implementation had a major gap where the player dragon had no direct input controls and could only be moved via collision shifts or companion pushes. **Ensure you build input controls for the player character.**
- **Do NOT assume high levels affect combat yet**: Leveling is purely cosmetic in the reference code.

---

## 4. Key Systems vs. Placeholders

- **Core Gameplay Loops (Must Keep)**: Stat decays, card combinations to craft dragons, castle walls forming defensive rings around buildings, and tower projectile combat.
- **Optional / Placeholders (Can Modify)**:
  - **Black Room Scene**: Entirely optional, serves as an atmospheric easter egg.
  - **Single Element Fireball**: You can replace the generic `fireball.png` projectile with elemental visuals matching the dragon's element (e.g. ice bolts, stone boulders).
  - **Grid Layout Scale**: The reference code scales large textures down (e.g. `0.08` or `0.15`). You should ideally crop or source textures matched to your grid's design resolution.
- **Stat Systems (Must Keep)**: The relationship between HP, Hunger, Energy, and Love must remain to preserve the caretaking core of the game.
