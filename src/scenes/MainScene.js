import Phaser from 'phaser';

export default class MainScene extends Phaser.Scene {
    constructor() {
        super('MainScene');
    }

    create() {
        // 1. Create World
        // Tiling sprite for infinite grass. 
        // Using a large area (4000x4000) to feel "infinite"
        const grass = this.add.tileSprite(1000, 1000, 4000, 4000, 'grass');
        grass.setTileScale(0.5); // Zooms out the grass texture by 2x

        // Set world bounds suitable for exploration
        this.physics.world.setBounds(0, 0, 2000, 2000);

        // 2. Create Player (Pixel Art Dragon)
        // Start in middle
        this.player = this.physics.add.sprite(1000, 1000, 'dragon');
        this.player.setCollideWorldBounds(true);

        // SCALE ADJUSTMENT:
        // Pixel art assets from AI are often 1024px.
        // For 16-bit look on screen, we need to scale WAY down.
        // 1024 * 0.08 ~= 82px. Good size for a character.
        this.player.setScale(0.08);

        // 3. Camera Follow
        this.cameras.main.setBounds(0, 0, 2000, 2000);
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this.cameras.main.setZoom(2.0); // Zoom in to appreciate the pixel art

        // 4. Input (Click to move)
        this.target = null;

        this.input.on('pointerdown', (pointer) => {
            this.target = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
            this.physics.moveToObject(this.player, this.target, 150); // Slower, relaxed speed

            // Face the direction
            if (this.target.x < this.player.x) {
                this.player.setFlipX(false);
            } else {
                this.player.setFlipX(true);
            }
        });

        // 5. Trees (Physics Group for Overlap)
        this.trees = this.physics.add.staticGroup();

        for (let i = 0; i < 30; i++) {
            const x = Phaser.Math.Between(200, 1800);
            const y = Phaser.Math.Between(200, 1800);
            const tree = this.trees.create(x, y, 'tree');
            tree.setScale(0.15);
            tree.refreshBody(); // Important for static bodies after scale change
        }

        // 6. Inventory System
        this.apples = 0;
        this.lastAppleTime = 0;
        this.coins = 0; // Initialize coins

        // UI is now handled by UIScene, which we ensure is on top
        this.scene.bringToTop('UIScene');

        // 7. Overlap Check
        this.physics.add.overlap(this.player, this.trees, this.collectApple, null, this);

        // 8. Rocks (Physics Group for Overlap)
        this.rocks = this.physics.add.staticGroup();

        for (let i = 0; i < 20; i++) { // Spawn 20 rocks
            const x = Phaser.Math.Between(200, 1800);
            const y = Phaser.Math.Between(200, 1800);
            const rock = this.rocks.create(x, y, 'rock');
            rock.setScale(0.15);
            rock.refreshBody();
        }

        this.physics.add.overlap(this.player, this.rocks, this.breakRock, null, this);
    }

    update() {
        // Stop if close to target
        if (this.target) {
            const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.target.x, this.target.y);
            if (distance < 10) {
                this.player.body.reset(this.target.x, this.target.y);
                this.target = null;
            }
        }
    }

    collectApple(player, tree) {
        // Simple cooldown to prevent collecting too many apples at once
        const now = this.time.now;
        if (now - this.lastAppleTime > 2000) { // 2 seconds cooldown
            this.apples++;
            this.lastAppleTime = now;

            // Emit Event to UIScene
            this.events.emit('updateAppleCount', this.apples);
            this.events.emit('collectAppleAnim');
        }
    }

    breakRock(player, rock) {
        // Destroy the rock
        rock.destroy();

        // Increment coin count
        this.coins++;

        // Emit Event to UIScene
        this.events.emit('updateCoinCount', this.coins);
    }
}
