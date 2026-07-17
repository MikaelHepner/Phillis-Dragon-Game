# 📦 Asset Manifest

---

## 1. Graphical Assets (Textures & Sprites)

All visual resources are 2D static sprites stored in `public/assets/`. High-resolution PNGs are scaled down programmatically using game engine scaling options.

### World Objects & Backgrounds

| Asset File | Key | Original Size | Intended Scale | Purpose |
|---|---|---|---|---|
| `grass_pixel.png` | `grass` | 128 × 128 | 0.5 (Tiled) | Repeating infinite ground texture |
| `appletree.png` | `tree` | 512 × 512 | 0.15 | Apple harvesting tree |
| `rock_pixel.png` | `rock` | 256 × 256 | 0.15 | Coin rock resource |
| `house.png` | `house` | 512 × 512 | 0.20 | Player-built house |
| `castle_pixel.png` | `castle` | 1024 × 1024 | 0.15 | Player-built fortress |
| `wall_pixel.png` | `wall` | 128 × 128 | Computed (40×40) | Castle protective walls |
| `battle_arena.png`| `battle_arena` | 1024 × 768 | Fitted to screen | Battle Arena background |

### Dragon Sprites

All dragons use high-resolution transparent PNG illustrations, scaled down to `0.08` for gameplay sprites.

| File Name | Texture Key | Description |
|---|---|---|
| `dragon.png` | `dragon` | Base green dragon (Phillis) |
| `dragon_fire.png` | `dragon_fire` | Red fire element |
| `dragon_ice.png` | `dragon_ice` | Frost blue ice element |
| `dragon_storm.png` | `dragon_storm` | Lightning purple element |
| `dragon_water.png` | `dragon_water` | Aquatic blue element |
| `dragon_stone.png` | `dragon_stone` | Rocky brown element |
| `dragon_poison.png` | `dragon_poison` | Venomed green/purple element |
| `dragon_plant.png` | `dragon_plant` | Leafy forest element |
| `dragon_soda.png` | `dragon_soda` | Fizzy soft-drink element |
| `dragon_sand.png` | `dragon_sand` | Desert beige element |
| `dragon_metal.png` | `dragon_metal` | Steel silver element |
| `dragon_paper.png` | `dragon_paper` | Origami folded white element |
| `dragon_diamond.png` | `dragon_diamond` | Crystalline blue element |
| `dragon_glass.png` | `dragon_glass` | Translucent shiny element |
| `dragon_jacket.png` | `dragon_jacket` | Cozy winter jacket element |
| `dragon_light.png` | `dragon_light` | Golden holy light element |
| `dragon_coffee.png` | `dragon_coffee` | Warm brown caffeine element |

### UI & Projectiles

| Asset File | Key | Original Size | Purpose |
|---|---|---|---|
| `backpack_pixel.png` | `backpack` | 256 × 256 | Inventory HUD button |
| `cart_pixel.png` | `cart` | 256 × 256 | Store HUD button |
| `apple_pixel.png` | `apple` | 256 × 256 | Apple resource indicator / card art |
| `coin.png` | `coin` | 256 × 256 | Coin currency indicator |
| `heart_pixel.png` | `heart` | 128 × 128 | Petting happy animation emitter |
| `pack.png` | `pack` | 512 × 512 | Card pack shop image |
| `fishing_rod.png` | `fishing_rod` | 256 × 256 | Fishing card icon |
| `fireball.png` | `fireball` | 128 × 128 | Battle Scene fireball projectile |
| `armor.png` | `armor` | 256 × 256 | Preloaded, unused card asset |
| `part_head.png` | `part_head` | 128 × 128 | Card crafting part (Head) |
| `part_wings.png` | `part_wings` | 128 × 128 | Card crafting part (Wings) |
| `part_tail.png` | `part_tail` | 128 × 128 | Card crafting part (Tail) |
| `part_body.png` | `part_body` | 128 × 128 | Card crafting part (Body) |
| `combo_2.png` | `combo_2` | 256 × 256 | Card layout icon for 2 parts connected |
| `combo_3.png` | `combo_3` | 256 × 256 | Card layout icon for 3 parts connected |

---

## 2. Fonts

The game relies entirely on default system-level web fonts declared inside scene layout commands:
- **Primary Typeface**: `"Courier New", Courier, monospace`
- **Secondary Typeface**: `Arial, Helvetica, sans-serif`

*Fonts are rendered dynamically using HTML5 Canvas text rendering API commands.*

---

## 3. Procedural Animations (Tween Manifest)

The game uses programmatic animations (tweens) instead of multi-frame spritesheets.

- **Idle Breathing**: Yoyo vertical floating displacement of `-10px` over `1500ms` with a `Sine.easeInOut` easing curve (applied to Battle Scene combatants).
- **Lunge Attack**: Attacker slides forward `30px` (or `-30px` depending on orientation), yoyo completes in `100ms` with standard easing.
- **Fireball Projectile**: Tweens straight from attacker coordinate vector to target, duration `250ms`/`500ms`.
- **Pet Happy Bounce**: Quickly squashes the dragon (`scaleX: 0.09, scaleY: 0.07`), yoyo runs twice in `100ms` under `Sine.easeInOut`.
- **Pet Floating Hearts**: Instantiates 3 heart sprites scaling from `0.05` to `0.1`, sliding up randomly (`-100` to `-150px` vertically, `±50px` horizontally) while fading to `alpha: 0` over `1500ms` using `Cubic.easeOut`.
- **Upgrade House Bounce**: Squashes house (`scaleX: 0.25, scaleY: 0.15`), yoyo repeats twice in `150ms`, returning to default `0.2` scale.
- **Card Reveal**: Card container scales from `0` to `1` over `600ms` using `Back.easeOut`.
- **Defensive Wall Stagger**: Segments scale from `0` to target scale over `400ms` using `Back.easeOut`, staggered by `40ms` index delays.
- **Floating Indicators**: Text slides up `30px` while fading out over `1500ms`/`2000ms`.
- **Enemy Death Spin**: Spin rotating `180°` while shrinking to `scale: 0` and fading out over `500ms`.
