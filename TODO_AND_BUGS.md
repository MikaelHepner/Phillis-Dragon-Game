# 📝 TODO & Bugs Log

---

## 1. Unfinished Features (Roadmap / TODOs)

| Feature | Description | Priority | Dependencies | Suggested Implementation |
|---|---|---|---|---|
| **Direct Player Movement** | Allow players to move their dragon directly using keyboard keys (WASD / Arrow Keys) or click-to-move pathfinding, rather than relying only on autonomous companion code. | **CRITICAL** | None | Bind keyboard input keys (`W`, `A`, `S`, `D`) and apply velocity to the player sprite (`this.player`). |
| **Save / Load System** | Save current resources, owned dragons, cards, structures, and levels. Load them back on game boot. | **HIGH** | None | Write states to HTML5 `localStorage` as JSON strings on changes; parse them inside `MainScene.create()`. |
| **Audio integration** | Adding background music (cozy theme for island, active theme for Battle Arena) and visual-action sound effects. | **MEDIUM** | BootScene preload | Preload audio files inside `BootScene`, add play commands during interaction events (e.g. `this.sound.play('click')`). |
| **Dragon Levels Scaling** | Make dragon level-ups increase maximum health, attack damage, or unlock unique element-based battle abilities. | **MEDIUM** | Dragon stats | Scale the base damage parameter inside `BattleScene.js` dynamically based on `dragon.stats.level`. |
| **Passive Rock Respawn** | Rocks currently disappear forever once broken, creating a coin generation ceiling. | **LOW** | None | Run a recurring scene timer checking rock count; spawn new rock instances inside world boundaries. |
| **Multiple Islands** | Portals or boats to travel to different islands with distinct biomes (fire islands, snow meadows). | **LOW** | World maps | Build additional scene maps; reload scenes with different tilesets. |

---

## 2. Known Issues & Bugs

### 1. Absolute Lack of Player Movement Controls
- **Symptom**: The player dragon (Phillis) cannot be moved directly.
- **Suspected Cause**: The developer set up the camera to follow the player sprite, but never bound inputs (cursors, WASD) to apply velocities to the player. The player is locked at (1000, 1000) unless pushed by buildings or chased by enemies.
- **Workaround**: Currently, the player is moved dynamically when collision overlays (such as placing a house or castle) slide it out of boundaries.

### 2. Apple Tree Overlap Rapid Collection
- **Symptom**: Standing on an apple tree can sometimes yield multiple apples if the player stays within boundaries.
- **Suspected Cause**: The overlap check triggers multiple times as the physics engine updates. Although a cooldown (`this.lastAppleTime`) is implemented, it only applies to the check.
- **Fix / Workaround**: Disable the overlap check or temporarily offset the player dragon upon collision.

### 3. Level-up Visuals Only
- **Symptom**: Leveling up dragons prints "+1 Level" but stats (HP, attack damage) remain identical to level 1.
- **Suspected Cause**: Stat scalars are hardcoded to `10` or `100` inside combat scripts, rather than pulling level values.

---

## 3. Future Expansion Ideas

1. **Dragon Breeding**: Buy incubator nests, pair two different dragon elements (e.g. Fire + Ice), wait 5 minutes, and hatch a hybrid dragon type (e.g. Steam Dragon).
2. **Safe Local Multiplayer**: Allow two browsers on the same local network to sync coordinates and roam the same island, engaging in co-op battles.
3. **Quest Board**: Spawns NPC boards request items (e.g. "Deliver 10 Apples") in exchange for card pack coins or rare components.
4. **Day-Night Lighting overlay**: A cycle overlay that slowly tints the screen blue/dark at night, forcing players to build campfire structures for light.
5. **Dragon Customization**: Cosmetic items (hats, crowns, armor) built with card connections.
