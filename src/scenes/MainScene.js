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

        // 4. Input (Dragon Menu)
        this.player.setInteractive({ useHandCursor: true });
        this.player.on('pointerdown', () => {
            console.log('Dragon clicked!');
            this.events.emit('showDragonMenu');
        });

        // 5. Trees (Physics Group for Overlap)
        this.trees = this.physics.add.staticGroup();

        for (let i = 0; i < 30; i++) {
            let x, y, distance;
            do {
                x = Phaser.Math.Between(200, 1800);
                y = Phaser.Math.Between(200, 1800);
                distance = Phaser.Math.Distance.Between(x, y, 1000, 1000);
            } while (distance < 150); // Keep trees away from spawn point

            const tree = this.trees.create(x, y, 'tree');
            tree.setScale(0.15);
            tree.refreshBody();
        }

        // 6. Inventory & Stats System
        this.apples = 0;
        this.lastAppleTime = 0;
        this.coins = 0;

        // Dragon Stats
        this.stats = {
            love: 20,
            hunger: 80,
            energy: 100,
            level: 1,
            xp: 0
        };

        // Owned Dragons (Team selection will use this)
        this.ownedDragons = [
            { name: 'Phillis', key: 'dragon' }
        ];

        // Owned Cards (Received from packs)
        this.ownedCards = [];

        // 7. Overlap Check
        this.physics.add.overlap(this.player, this.trees, this.collectApple, null, this);

        // 8. Rocks (Physics Group for Overlap)
        this.rocks = this.physics.add.staticGroup();

        for (let i = 0; i < 20; i++) { // Spawn 20 rocks
            let x, y, distance;
            do {
                x = Phaser.Math.Between(200, 1800);
                y = Phaser.Math.Between(200, 1800);
                distance = Phaser.Math.Distance.Between(x, y, 1000, 1000);
            } while (distance < 150);

            const rock = this.rocks.create(x, y, 'rock');
            rock.setScale(0.15);
            rock.refreshBody();
        }

        this.physics.add.overlap(this.player, this.rocks, this.breakRock, null, this);
        
        // Listen for pet events
        this.events.on('petDragon', () => {
            this.stats.love = Math.min(100, this.stats.love + 5);
            this.events.emit('updateStats', this.stats);
            this.handlePetAnimation();
        });

        // Listen for fight events
        this.events.on('startFight', () => {
            this.handleFight();
        });

        // Listen for build events
        this.events.on('buildItem', (card) => {
            this.handleBuildItem(card);
        });

        // Stat Decay Timer (Every 10 seconds)
        this.time.addEvent({
            delay: 10000,
            callback: () => {
                this.stats.hunger = Math.max(0, this.stats.hunger - 2);
                this.stats.energy = Math.max(0, this.stats.energy - 1);
                this.events.emit('updateStats', this.stats);
            },
            loop: true
        });

        // Launch UI Scene now that we are ready
        this.scene.launch('UIScene');
    }

    handleFight() {
        if (this.stats.energy < 20) {
            this.events.emit('updateStats', this.stats);
            return;
        }

        // 1. Spend Energy
        this.stats.energy -= 20;

        // 2. Gain XP
        this.stats.xp += 35;
        
        // Check Level Up
        if (this.stats.xp >= 100) {
            this.stats.xp -= 100;
            this.stats.level++;
        }

        this.events.emit('updateStats', this.stats);
    }

    handleBuildItem(card) {
        console.log(`Building: ${card.name}`);

        // Spawn position near player
        const x = this.player.x + Phaser.Math.Between(-30, 30);
        const y = this.player.y + Phaser.Math.Between(-30, 30);

        // Create the item sprite
        const item = this.add.sprite(x, y, card.key);
        
        // Scale it based on the item type (most are 0.1 - 0.15 in this game)
        item.setScale(0); // Start at 0 for animation
        
        const targetScale = 0.15;

        // Placement animation (Scale up and bounce)
        this.tweens.add({
            targets: item,
            scale: targetScale,
            duration: 500,
            ease: 'Back.easeOut'
        });

        // If it's a tree or rock, we might want to add it to a group, 
        // but for "decorations" from cards, we just leave them as sprites.
        
        // Special case: If it's food, maybe it disappears after a while?
        if (card.type === 'Food') {
            this.time.delayedCall(5000, () => {
                this.tweens.add({
                    targets: item,
                    alpha: 0,
                    scale: 0,
                    duration: 1000,
                    onComplete: () => item.destroy()
                });
            });
        }
    }

    handlePetAnimation() {
        // 1. Dragon "Happy" Tween (Bounce/Squash)
        this.tweens.add({
            targets: this.player,
            scaleX: 0.09,
            scaleY: 0.07,
            duration: 100,
            yoyo: true,
            repeat: 1,
            ease: 'Sine.easeInOut'
        });

        // 2. Spawn Hearts
        for (let i = 0; i < 3; i++) {
            const heart = this.add.image(this.player.x, this.player.y - 20, 'heart');
            heart.setScale(0.05);
            heart.setAlpha(1);
            
            // Randomize heart trajectory
            const destX = this.player.x + Phaser.Math.Between(-50, 50);
            const destY = this.player.y - Phaser.Math.Between(100, 150);
            
            this.tweens.add({
                targets: heart,
                x: destX,
                y: destY,
                alpha: 0,
                scale: 0.1,
                duration: 1500,
                ease: 'Cubic.easeOut',
                onComplete: () => heart.destroy()
            });
        }
    }

    update() {
        // Dragon movement is disabled
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
