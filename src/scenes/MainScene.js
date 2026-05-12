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

        // 2. Create Dragons Group
        this.dragonSprites = this.physics.add.group();
        
        // Function to spawn a dragon
        this.spawnDragon = (dragonData, isPlayer = false) => {
            const x = isPlayer ? 1000 : 1000 + Phaser.Math.Between(-100, 100);
            const y = isPlayer ? 1000 : 1000 + Phaser.Math.Between(-100, 100);
            
            const dragon = this.physics.add.sprite(x, y, dragonData.key);
            dragon.setScale(0.08);
            dragon.setCollideWorldBounds(true);
            dragon.setInteractive({ useHandCursor: true });
            
            dragon.on('pointerdown', () => {
                this.events.emit('showDragonMenu', dragonData);
            });
            
            this.dragonSprites.add(dragon);
            
            if (!isPlayer) {
                // Roaming logic for companion dragons
                this.time.addEvent({
                    delay: 3000 + Math.random() * 2000,
                    callback: () => {
                        if (dragon.active) {
                            dragon.setVelocity(
                                Phaser.Math.Between(-30, 30),
                                Phaser.Math.Between(-30, 30)
                            );
                        }
                    },
                    loop: true
                });
            }
            
            return dragon;
        };

        // 3. Initialize Owned Dragons with individual stats
        this.ownedDragons = [
            { 
                name: 'Phillis', 
                key: 'dragon',
                stats: { love: 20, hunger: 80, energy: 100, level: 1, xp: 0 }
            }
        ];
        
        // Spawn them (First one is the "player" for camera follow)
        this.ownedDragons.forEach((d, index) => {
            const sprite = this.spawnDragon(d, index === 0);
            if (index === 0) this.player = sprite;
        });

        // 4. Camera Follow
        this.cameras.main.setBounds(0, 0, 2000, 2000);
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this.cameras.main.setZoom(2.0);

        // 5. Trees (Physics Group)
        this.trees = this.physics.add.staticGroup();
        for (let i = 0; i < 30; i++) {
            let x, y, distance;
            do {
                x = Phaser.Math.Between(200, 1800);
                y = Phaser.Math.Between(200, 1800);
                distance = Phaser.Math.Distance.Between(x, y, 1000, 1000);
            } while (distance < 300); // Increased buffer to prevent spawning on dragons
            const tree = this.trees.create(x, y, 'tree').setScale(0.15).refreshBody();
        }

        // 6. Inventory System
        this.apples = 0;
        this.coins = 0;
        this.wood = 0;
        this.fish = 0;
        this.ownedCards = [];
        
        // Prevent instant collection on refresh
        this.lastAppleTime = this.time.now + 1000; 

        // 7. Overlap Checks
        this.physics.add.overlap(this.dragonSprites, this.trees, this.collectApple, null, this);
        
        // 8. Rocks
        this.rocks = this.physics.add.staticGroup();
        for (let i = 0; i < 20; i++) {
            let x, y, distance;
            do {
                x = Phaser.Math.Between(200, 1800);
                y = Phaser.Math.Between(200, 1800);
                distance = Phaser.Math.Distance.Between(x, y, 1000, 1000);
            } while (distance < 300);
            const rock = this.rocks.create(x, y, 'rock').setScale(0.15).refreshBody();
        }
        this.physics.add.overlap(this.dragonSprites, this.rocks, this.breakRock, null, this);
        
        // 9. Houses
        this.houses = this.physics.add.staticGroup();
        
        // Listen for events
        this.events.on('dragonAdded', (newDragon) => {
            if (!newDragon.stats) {
                newDragon.stats = { love: 10, hunger: 50, energy: 100, level: 1, xp: 0 };
            }
            this.spawnDragon(newDragon);
        });

        this.events.on('petDragon', (dragon) => {
            if (dragon && dragon.stats) {
                dragon.stats.love = Math.min(100, dragon.stats.love + 5);
                this.events.emit('updateStats', dragon.stats);
                this.handlePetAnimation(dragon);
            }
        });

        this.events.on('giveTree', (data) => {
            this.handleWoodGeneration(data.dragon, data.card);
        });

        this.events.on('giveFishingRod', (data) => {
            this.handleFishGeneration(data.dragon, data.card);
        });

        this.events.on('giveAppleCard', (data) => {
            this.handleAppleGeneration(data.dragon, data.card);
        });

        this.events.on('buildHouse', () => {
            this.spawnHouse();
        });

        // Global Stat Decay (Affects all owned dragons)
        this.time.addEvent({
            delay: 15000,
            callback: () => {
                this.ownedDragons.forEach(d => {
                    if (d.stats) {
                        d.stats.hunger = Math.max(0, d.stats.hunger - 1);
                        d.stats.energy = Math.max(0, d.stats.energy - 1);
                    }
                });
                // Note: UIScene will need to refresh the active dragon's bars
                this.events.emit('refreshActiveStats');
            },
            loop: true
        });

        this.scene.launch('UIScene');
    }

    handleFight(dragon) {
        if (!dragon || !dragon.stats) return;
        if (dragon.stats.energy < 20) {
            this.events.emit('updateStats', dragon.stats);
            return;
        }

        // 1. Spend Energy
        dragon.stats.energy -= 20;

        // 2. Gain XP
        dragon.stats.xp += 35;
        
        // Check Level Up
        if (dragon.stats.xp >= 100) {
            dragon.stats.xp -= 100;
            dragon.stats.level++;
        }

        this.events.emit('updateStats', dragon.stats);
    }

    handleWoodGeneration(dragonData, card) {
        // Find the sprite
        const sprite = this.dragonSprites.getChildren().find(s => s.texture.key === dragonData.key);
        if (!sprite) return;

        // Visual feedback on dragon
        const woodIcon = this.add.image(sprite.x, sprite.y - 40, 'tree').setScale(0.05);
        this.tweens.add({
            targets: woodIcon,
            y: '-=20',
            duration: 1000,
            yoyo: true,
            repeat: -1
        });

        const woodTimer = this.time.addEvent({
            delay: 5000,
            callback: () => {
                this.wood++;
                this.events.emit('updateWoodCount', this.wood);
                
                const text = this.add.text(sprite.x, sprite.y - 60, '+1 Wood', {
                    fontSize: '16px',
                    fill: '#8b4513',
                    fontStyle: 'bold'
                }).setOrigin(0.5);
                
                this.tweens.add({
                    targets: text,
                    y: '-=30',
                    alpha: 0,
                    duration: 2000,
                    onComplete: () => text.destroy()
                });
            },
            repeat: 11
        });

        this.time.delayedCall(60000, () => {
            woodIcon.destroy();
        });
    }

    handleFishGeneration(dragonData, card) {
        // Find the sprite
        const sprite = this.dragonSprites.getChildren().find(s => s.texture.key === dragonData.key);
        if (!sprite) return;

        // Visual feedback on dragon
        const fishIcon = this.add.image(sprite.x, sprite.y - 40, 'fishing_rod').setScale(0.08);
        this.tweens.add({
            targets: fishIcon,
            y: '-=20',
            duration: 1000,
            yoyo: true,
            repeat: -1
        });

        const fishTimer = this.time.addEvent({
            delay: 5000,
            callback: () => {
                this.fish++;
                this.events.emit('updateFishCount', this.fish);
                
                const text = this.add.text(sprite.x, sprite.y - 60, '+1 Fish', {
                    fontSize: '16px',
                    fill: '#00ffff',
                    fontStyle: 'bold'
                }).setOrigin(0.5);
                
                this.tweens.add({
                    targets: text,
                    y: '-=30',
                    alpha: 0,
                    duration: 2000,
                    onComplete: () => text.destroy()
                });
            },
            repeat: 11
        });

        this.time.delayedCall(60000, () => {
            fishIcon.destroy();
        });
    }

    handleAppleGeneration(dragonData, card) {
        // Find the sprite
        const sprite = this.dragonSprites.getChildren().find(s => s.texture.key === dragonData.key);
        if (!sprite) return;

        // Visual feedback on dragon
        const appleIcon = this.add.image(sprite.x, sprite.y - 40, 'apple').setScale(0.08);
        this.tweens.add({
            targets: appleIcon,
            y: '-=20',
            duration: 1000,
            yoyo: true,
            repeat: -1
        });

        const appleTimer = this.time.addEvent({
            delay: 5000,
            callback: () => {
                this.apples++;
                this.events.emit('updateApples', this.apples);
                
                const text = this.add.text(sprite.x, sprite.y - 60, '+1 Apple', {
                    fontSize: '16px',
                    fill: '#ff0000',
                    fontStyle: 'bold'
                }).setOrigin(0.5);
                
                this.tweens.add({
                    targets: text,
                    y: '-=30',
                    alpha: 0,
                    duration: 2000,
                    onComplete: () => text.destroy()
                });
            },
            repeat: 11
        });

        this.time.delayedCall(60000, () => {
            appleIcon.destroy();
        });
    }

    handlePetAnimation(dragonData) {
        // Find the sprite corresponding to this dragonData
        const sprite = this.dragonSprites.getChildren().find(s => s.texture.key === dragonData.key);
        if (!sprite) return;

        // 1. Dragon "Happy" Tween (Bounce/Squash)
        this.tweens.add({
            targets: sprite,
            scaleX: 0.09,
            scaleY: 0.07,
            duration: 100,
            yoyo: true,
            repeat: 1,
            ease: 'Sine.easeInOut'
        });

        // 2. Spawn Hearts
        for (let i = 0; i < 3; i++) {
            const heart = this.add.image(sprite.x, sprite.y - 20, 'heart');
            heart.setScale(0.05);
            heart.setAlpha(1);
            
            // Randomize heart trajectory
            const destX = sprite.x + Phaser.Math.Between(-50, 50);
            const destY = sprite.y - Phaser.Math.Between(100, 150);
            
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
            this.events.emit('updateApples', this.apples);
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

    spawnHouse() {
        // Spawn near player but not exactly on top
        const x = this.player.x + Phaser.Math.Between(-100, 100);
        const y = this.player.y + Phaser.Math.Between(-100, 100);
        
        const house = this.houses.create(x, y, 'house');
        house.setScale(0.2); // Adjust scale as needed
        house.refreshBody();

        // Visual feedback
        const text = this.add.text(x, y - 50, '🏠 House Built!', {
            fontSize: '20px',
            fill: '#ffffff',
            backgroundColor: '#000000',
            padding: { x: 10, y: 5 }
        }).setOrigin(0.5);

        this.tweens.add({
            targets: text,
            y: '-=50',
            alpha: 0,
            duration: 3000,
            onComplete: () => text.destroy()
        });
    }
}
