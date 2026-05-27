import Phaser from 'phaser';

export default class MainScene extends Phaser.Scene {
    constructor() {
        super('MainScene');
    }

    create() {
        this.isGameOver = false;

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
            
            // Companion dragons will follow player in the update() loop
            
            return dragon;
        };

        // 3. Initialize Owned Dragons with individual stats
        this.ownedDragons = [
            { 
                name: 'Phillis', 
                key: 'dragon',
                stats: { love: 20, hunger: 80, energy: 100, hp: 100, level: 1, xp: 0 }
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
        this.stone = 0;
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
        this.physics.add.collider(this.dragonSprites, this.houses);
        
        // Listen for events
        this.events.on('dragonAdded', (newDragon) => {
            if (!newDragon.stats) {
                newDragon.stats = { love: 10, hunger: 50, energy: 100, hp: 100, level: 1, xp: 0 };
            } else if (newDragon.stats.hp === undefined) {
                newDragon.stats.hp = 100;
            }
            this.spawnDragon(newDragon);
        });

        this.events.on('petDragon', (dragon) => {
            if (dragon && dragon.stats) {
                dragon.stats.love = Math.min(100, dragon.stats.love + 5);
                dragon.stats.hp = Math.min(100, (dragon.stats.hp !== undefined ? dragon.stats.hp : 100) + 15);
                this.events.emit('updateStats', dragon.stats);
                this.events.emit('refreshActiveStats');
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

        this.events.on('buildCastle', () => {
            this.spawnCastle();
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

        // House upgrades passive resource generation
        this.time.addEvent({
            delay: 5000, // Check every 5 seconds
            callback: () => {
                this.houses.getChildren().forEach(house => {
                    if (house.upgradeType === 'mine') {
                        this.stone += 1;
                        this.events.emit('updateStoneCount', this.stone);
                        this.showFloatingText(house.x, house.y - 65, '+1 Stone 🪨', '#aaaaaa');
                    } else if (house.upgradeType === 'blacksmith') {
                        this.wood += 1;
                        this.events.emit('updateWoodCount', this.wood);
                        this.showFloatingText(house.x, house.y - 65, '+1 Wood 🪵', '#d7ccc8');
                    }
                });
            },
            loop: true
        });

        // 10. Black Dragons (Enemies)
        this.blackDragons = this.physics.add.group();
        this.physics.add.collider(this.blackDragons, this.houses);

        // Tower attack loop
        this.time.addEvent({
            delay: 2500, // Check and shoot every 2.5 seconds
            callback: () => {
                if (this.isGameOver) return;
                this.houses.getChildren().forEach(house => {
                    if (house.upgradeType === 'tower') {
                        this.shootTowerArrow(house);
                    }
                });
            },
            loop: true
        });
        
        // Spawn initial black dragons
        this.time.delayedCall(2000, () => {
            this.spawnBlackDragon();
            this.spawnBlackDragon();
        });

        // Spawn new black dragons every 25 seconds
        this.time.addEvent({
            delay: 25000,
            callback: () => {
                this.spawnBlackDragon();
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
        if (this.isGameOver) return;

        // Black Dragons AI & Chasing behavior
        const now = this.time.now;

        this.blackDragons.getChildren().forEach(enemy => {
            if (!enemy.active) return;

            // Find closest dragon from player's team
            let closestDragon = null;
            let minDist = 400; // Agro range: 400px

            this.dragonSprites.getChildren().forEach(dragon => {
                if (dragon.active) {
                    const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, dragon.x, dragon.y);
                    if (dist < minDist) {
                        minDist = dist;
                        closestDragon = dragon;
                    }
                }
            });

            if (closestDragon) {
                const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, closestDragon.x, closestDragon.y);
                
                // Rush and stay next to target, not directly on top
                if (minDist > 55) {
                    const speed = 55;
                    enemy.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
                } else if (minDist < 45) {
                    // Back off slightly to avoid overlapping
                    const speed = -30;
                    enemy.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
                } else {
                    enemy.setVelocity(0, 0); // Stay next to it
                }

                // Flip sprite based on direction
                enemy.setFlipX(enemy.body.velocity.x > 0);

                // Attack when close
                if (minDist < 60 && now - enemy.lastAttackTime > 3000) {
                    enemy.lastAttackTime = now;
                    this.enemyAttack(enemy, closestDragon);
                }
            } else {
                // Roam around randomly if no dragon is close
                if (!enemy.roamTimer || now - enemy.roamTimer > 3000) {
                    enemy.roamTimer = now;
                    enemy.setVelocity(
                        Phaser.Math.Between(-30, 30),
                        Phaser.Math.Between(-30, 30)
                    );
                    enemy.setFlipX(enemy.body.velocity.x > 0);
                }
            }

            // Keep label updated as dragon moves
            if (enemy.label) {
                enemy.label.setPosition(enemy.x, enemy.y - 45);
            }
        });

        // Companion Dragons Follow AI (stay next to the player dragon, not on top)
        this.dragonSprites.getChildren().forEach(dragon => {
            if (dragon === this.player || !dragon.active) return;

            const dist = Phaser.Math.Distance.Between(dragon.x, dragon.y, this.player.x, this.player.y);

            if (dist > 120) {
                // Rush towards player
                const angle = Phaser.Math.Angle.Between(dragon.x, dragon.y, this.player.x, this.player.y);
                const speed = 90;
                dragon.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
                dragon.setFlipX(dragon.body.velocity.x > 0);
            } else if (dist < 60) {
                // Back off to prevent overlapping on top of the player
                const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, dragon.x, dragon.y);
                const speed = 40;
                dragon.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
                dragon.setFlipX(dragon.body.velocity.x > 0);
            } else {
                // Stay next to the player, stop moving
                dragon.setVelocity(0, 0);
            }

            // Keep label updated
            if (dragon.label) {
                dragon.label.setPosition(dragon.x, dragon.y - 45);
            }
        });
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
        // Find a location near player that is not too close to the player or any dragon sprites
        let x = this.player.x;
        let y = this.player.y;
        let isTooClose = true;
        let attempts = 0;

        while (isTooClose && attempts < 100) {
            const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            // Spawn in a ring between 80px and 160px from the player
            const distance = Phaser.Math.Between(80, 160);
            x = this.player.x + Math.cos(angle) * distance;
            y = this.player.y + Math.sin(angle) * distance;

            isTooClose = false;
            this.dragonSprites.getChildren().forEach(dragon => {
                const dist = Phaser.Math.Distance.Between(x, y, dragon.x, dragon.y);
                if (dist < 85) { // Minimum distance from any dragon's center
                    isTooClose = true;
                }
            });
            attempts++;
        }

        const house = this.houses.create(x, y, 'house');
        house.setScale(0.2); // Adjust scale as needed
        house.refreshBody();
        
        // Push any overlapping friendly dragons away with a slide animation
        this.dragonSprites.getChildren().forEach(dragon => {
            const dist = Phaser.Math.Distance.Between(house.x, house.y, dragon.x, dragon.y);
            if (dist < 95) {
                const angle = Phaser.Math.Angle.Between(house.x, house.y, dragon.x, dragon.y);
                const pushDist = 95 - dist;
                
                dragon.x += Math.cos(angle) * pushDist;
                dragon.y += Math.sin(angle) * pushDist;
                
                this.tweens.add({
                    targets: dragon,
                    x: dragon.x + Math.cos(angle) * 30,
                    y: dragon.y + Math.sin(angle) * 30,
                    duration: 250,
                    ease: 'Cubic.easeOut',
                    onUpdate: () => {
                        if (dragon.label) {
                            dragon.label.setPosition(dragon.x, dragon.y - 45);
                        }
                    }
                });
            }
        });

        // Push any overlapping black dragons away
        this.blackDragons.getChildren().forEach(dragon => {
            const dist = Phaser.Math.Distance.Between(house.x, house.y, dragon.x, dragon.y);
            if (dist < 95) {
                const angle = Phaser.Math.Angle.Between(house.x, house.y, dragon.x, dragon.y);
                const pushDist = 95 - dist;
                dragon.x += Math.cos(angle) * pushDist;
                dragon.y += Math.sin(angle) * pushDist;
                if (dragon.label) {
                    dragon.label.setPosition(dragon.x, dragon.y - 45);
                }
            }
        });
        
        // Add persistent label
        const label = this.add.text(x, y - 45, '🏠 Dragon House', {
            fontSize: '12px',
            fill: '#ffffff',
            backgroundColor: '#1a1a1a',
            padding: { x: 4, y: 2 }
        }).setOrigin(0.5);
        house.label = label;
        house.upgradeType = null;

        // Interactive click handler
        house.setInteractive({ useHandCursor: true });
        house.on('pointerdown', () => {
            this.events.emit('showHouseUpgradeMenu', house);
        });

        // Visual feedback
        const text = this.add.text(x, y - 70, '🏠 House Built!', {
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

    spawnCastle() {
        // Find a location near player that is not too close to the player or any dragon sprites
        let x = this.player.x;
        let y = this.player.y;
        let isTooClose = true;
        let attempts = 0;

        while (isTooClose && attempts < 100) {
            const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            // Spawn in a ring further away for larger structure
            const distance = Phaser.Math.Between(100, 200);
            x = this.player.x + Math.cos(angle) * distance;
            y = this.player.y + Math.sin(angle) * distance;

            isTooClose = false;
            this.dragonSprites.getChildren().forEach(dragon => {
                const dist = Phaser.Math.Distance.Between(x, y, dragon.x, dragon.y);
                if (dist < 100) { 
                    isTooClose = true;
                }
            });
            attempts++;
        }

        const castle = this.houses.create(x, y, 'castle');
        castle.setScale(0.15); // Appropriate scale for the 1024x1024 generated image
        castle.refreshBody();
        
        // Push any overlapping friendly dragons away with a slide animation
        this.dragonSprites.getChildren().forEach(dragon => {
            const dist = Phaser.Math.Distance.Between(castle.x, castle.y, dragon.x, dragon.y);
            if (dist < 120) {
                const angle = Phaser.Math.Angle.Between(castle.x, castle.y, dragon.x, dragon.y);
                const pushDist = 120 - dist;
                
                dragon.x += Math.cos(angle) * pushDist;
                dragon.y += Math.sin(angle) * pushDist;
                
                this.tweens.add({
                    targets: dragon,
                    x: dragon.x + Math.cos(angle) * 30,
                    y: dragon.y + Math.sin(angle) * 30,
                    duration: 250,
                    ease: 'Cubic.easeOut',
                    onUpdate: () => {
                        if (dragon.label) {
                            dragon.label.setPosition(dragon.x, dragon.y - 45);
                        }
                    }
                });
            }
        });

        // Push any overlapping black dragons away
        this.blackDragons.getChildren().forEach(dragon => {
            const dist = Phaser.Math.Distance.Between(castle.x, castle.y, dragon.x, dragon.y);
            if (dist < 120) {
                const angle = Phaser.Math.Angle.Between(castle.x, castle.y, dragon.x, dragon.y);
                const pushDist = 120 - dist;
                dragon.x += Math.cos(angle) * pushDist;
                dragon.y += Math.sin(angle) * pushDist;
                if (dragon.label) {
                    dragon.label.setPosition(dragon.x, dragon.y - 45);
                }
            }
        });
        
        // Add persistent label
        const label = this.add.text(x, y - 75, '🏰 Castle', {
            fontSize: '14px',
            fill: '#ffffff',
            backgroundColor: '#333333',
            padding: { x: 4, y: 2 }
        }).setOrigin(0.5);
        castle.label = label;
        castle.upgradeType = null;

        // Interactive click handler
        castle.setInteractive({ useHandCursor: true });
        castle.on('pointerdown', () => {
            this.events.emit('showHouseUpgradeMenu', castle);
        });

        // Visual feedback
        const text = this.add.text(x, y - 100, '🏰 Castle Built!', {
            fontSize: '24px',
            fill: '#00ff00',
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

    upgradeHouse(house, type) {
        if (!house) return;
        house.upgradeType = type;

        // Visual updates based on type
        let labelText = '';
        let tintColor = 0xffffff;

        if (type === 'tower') {
            labelText = '🏰 Tower';
            tintColor = 0x90caf9; // light blue tint
        } else if (type === 'mine') {
            labelText = '⛏️ Mine';
            tintColor = 0xffe082; // gold tint
        } else if (type === 'blacksmith') {
            labelText = '🔨 Blacksmith';
            tintColor = 0xffab91; // red-orange tint
        }

        if (house.label) {
            house.label.setText(labelText);
            house.label.setStyle({
                fill: '#ffffff',
                backgroundColor: '#333333',
                stroke: '#ffffff',
                strokeThickness: 1
            });
        }

        house.setTint(tintColor);

        // Fun animation for upgrading! Squash and stretch the house
        this.tweens.add({
            targets: house,
            scaleX: 0.25,
            scaleY: 0.15,
            duration: 150,
            yoyo: true,
            repeat: 1,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                house.setScale(0.2);
            }
        });
    }

    showFloatingText(x, y, message, color) {
        const text = this.add.text(x, y, message, {
            fontSize: '14px',
            fill: color,
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);

        this.tweens.add({
            targets: text,
            y: '-=30',
            alpha: 0,
            duration: 1500,
            onComplete: () => text.destroy()
        });
    }

    spawnBlackDragon() {
        if (this.blackDragons.getLength() >= 4) return;

        let x, y, dist;
        let attempts = 0;
        do {
            x = Phaser.Math.Between(200, 1800);
            y = Phaser.Math.Between(200, 1800);
            dist = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
            attempts++;
        } while (dist < 400 && attempts < 100);

        const blackDragon = this.physics.add.sprite(x, y, 'dragon');
        blackDragon.setScale(0.08);
        blackDragon.setTint(0x222222); // Tint to black dragon
        blackDragon.setCollideWorldBounds(true);
        blackDragon.setInteractive({ useHandCursor: true });

        // Add label
        const label = this.add.text(x, y - 45, '😈 Black Dragon (100 HP)', {
            fontSize: '11px',
            fill: '#ff3333',
            backgroundColor: '#000000',
            padding: { x: 3, y: 1 }
        }).setOrigin(0.5);
        blackDragon.label = label;
        
        blackDragon.health = 100; // 100 HP
        blackDragon.lastAttackTime = 0;

        // Player clicks on black dragon to attack it
        blackDragon.on('pointerdown', () => {
            this.attackBlackDragon(blackDragon);
        });

        this.blackDragons.add(blackDragon);
    }

    attackBlackDragon(enemy) {
        if (!enemy || !enemy.active) return;

        // Distance check (player must be close enough, say 250px)
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
        if (dist > 250) {
            this.showFloatingText(enemy.x, enemy.y - 70, 'Too far away!', '#ff5555');
            return;
        }

        enemy.health = Math.max(0, enemy.health - 35);

        // Player lunge animation
        this.tweens.add({
            targets: this.player,
            x: enemy.x,
            y: enemy.y,
            duration: 100,
            yoyo: true,
            ease: 'Sine.easeOut'
        });

        // Slash indicator
        const hit = this.add.text(enemy.x, enemy.y, '💥', { fontSize: '32px' }).setOrigin(0.5);
        this.time.delayedCall(200, () => hit.destroy());

        if (enemy.health <= 0) {
            this.coins += 3;
            this.events.emit('updateCoinCount', this.coins);
            this.showFloatingText(enemy.x, enemy.y - 70, '🏆 Defeated! +3 Coins 🪙', '#ffff00');

            if (enemy.label) enemy.label.destroy();
            
            this.tweens.add({
                targets: enemy,
                alpha: 0,
                scale: 0,
                angle: 180,
                duration: 500,
                onComplete: () => {
                    enemy.destroy();
                }
            });
        } else {
            this.showFloatingText(enemy.x, enemy.y - 70, `💥 Hit! -35 HP`, '#ff9900');
            
            if (enemy.label) {
                enemy.label.setText(`😈 Black Dragon (${enemy.health} HP)`);
            }
            
            // Shake enemy
            this.tweens.add({
                targets: enemy,
                x: '+=5',
                duration: 50,
                yoyo: true,
                repeat: 3
            });
        }
    }

    enemyAttack(enemy, target) {
        // Find corresponding stats object to deduct hp
        const dragonData = this.ownedDragons.find(d => {
            const sprite = this.dragonSprites.getChildren().find(s => s.texture.key === d.key);
            return sprite === target;
        });

        // Attack lunging tween
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
        this.tweens.add({
            targets: enemy,
            x: target.x - Math.cos(angle) * 15,
            y: target.y - Math.sin(angle) * 15,
            duration: 100,
            yoyo: true,
            ease: 'Sine.easeOut'
        });

        // Fireball projectile
        const fireball = this.add.image(enemy.x, enemy.y, 'fireball');
        fireball.setScale(0.08);
        this.tweens.add({
            targets: fireball,
            x: target.x,
            y: target.y,
            duration: 250,
            onComplete: () => {
                fireball.destroy();

                // Target damage shake
                this.tweens.add({
                    targets: target,
                    x: '+=5',
                    duration: 50,
                    yoyo: true,
                    repeat: 2
                });

                if (dragonData && dragonData.stats) {
                    dragonData.stats.hp = Math.max(0, (dragonData.stats.hp !== undefined ? dragonData.stats.hp : 100) - 10);
                    this.events.emit('updateStats', dragonData.stats);
                    this.events.emit('refreshActiveStats');
                    this.showFloatingText(target.x, target.y - 60, '-10 HP 💔', '#ff3333');

                    // Check if player dragon (index 0) has fainted
                    if (this.ownedDragons[0] && this.ownedDragons[0].stats && this.ownedDragons[0].stats.hp <= 0) {
                        this.triggerGameOver();
                    }
                } else {
                    this.showFloatingText(target.x, target.y - 60, '-10 HP 💔', '#ff3333');
                }
            }
        });
    }

    shootTowerArrow(house) {
        // Find closest black dragon
        let target = null;
        let minDist = 400; // Attack range

        this.blackDragons.getChildren().forEach(enemy => {
            if (enemy.active) {
                const dist = Phaser.Math.Distance.Between(house.x, house.y, enemy.x, enemy.y);
                if (dist < minDist) {
                    minDist = dist;
                    target = enemy;
                }
            }
        });

        if (!target) return;

        // Create arrow projectile
        const startX = house.x;
        const startY = house.y - 30; // Spawns from top of the house
        
        const arrow = this.add.graphics();
        arrow.fillStyle(0xffd700, 1);
        arrow.fillRect(-10, -2, 20, 4); // Shaft
        arrow.fillTriangle(10, -6, 10, 6, 18, 0); // Head
        arrow.setPosition(startX, startY);

        const angle = Phaser.Math.Angle.Between(startX, startY, target.x, target.y);
        arrow.setRotation(angle);

        // Tween to target
        this.tweens.add({
            targets: arrow,
            x: target.x,
            y: target.y,
            duration: 300,
            onUpdate: () => {
                // Keep updating rotation and check if target is active
                if (target && target.active) {
                    const currentAngle = Phaser.Math.Angle.Between(arrow.x, arrow.y, target.x, target.y);
                    arrow.setRotation(currentAngle);
                }
            },
            onComplete: () => {
                arrow.destroy();

                if (target && target.active) {
                    // Deal 20 damage
                    target.health = Math.max(0, target.health - 20);

                    // Float damage text
                    this.showFloatingText(target.x, target.y - 70, '🏹 -20 HP', '#ffd700');

                    // Shake target
                    this.tweens.add({
                        targets: target,
                        x: '+=5',
                        duration: 50,
                        yoyo: true,
                        repeat: 2
                    });

                    // Update label
                    if (target.label) {
                        target.label.setText(`😈 Black Dragon (${target.health} HP)`);
                    }

                    // Check if defeated
                    if (target.health <= 0) {
                        this.coins += 3;
                        this.events.emit('updateCoinCount', this.coins);
                        this.showFloatingText(target.x, target.y - 70, '🏆 Defeated! +3 Coins 🪙', '#ffff00');

                        if (target.label) target.label.destroy();
                        
                        this.tweens.add({
                            targets: target,
                            alpha: 0,
                            scale: 0,
                            angle: 180,
                            duration: 500,
                            onComplete: () => {
                                target.destroy();
                            }
                        });
                    }
                }
            }
        });
    }

    triggerGameOver() {
        this.isGameOver = true;
        
        // Pause physics
        this.physics.pause();

        // Stop all scene timer events
        this.time.removeAllEvents();

        // Stop velocities
        this.dragonSprites.getChildren().forEach(d => {
            if (d.body) d.setVelocity(0, 0);
        });
        this.blackDragons.getChildren().forEach(enemy => {
            if (enemy.body) enemy.setVelocity(0, 0);
        });

        // Emit event to UIScene
        this.events.emit('gameOver');
    }
}
