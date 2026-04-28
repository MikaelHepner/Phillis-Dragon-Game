import Phaser from 'phaser';

export default class UIScene extends Phaser.Scene {
    constructor() {
        super({ key: 'UIScene' });
    }

    create() {
        // Our game is 800x600.
        // This scene will NOT zoom, so (750, 50) is actually top-right.

        // Backpack Icon
        this.backpack = this.add.image(750, 100, 'backpack');
        this.backpack.setScale(0.15);
        this.backpack.setInteractive({ useHandCursor: true });

        // Apple Counter Text (HUD)
        this.appleText = this.add.text(750, 100, '0', {
            fontSize: '26px',
            fontFamily: '"Courier New", Courier, monospace', // Retro font look
            fill: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // --- Inventory Window (Hidden by default) ---
        this.inventoryOpen = false;

        // Container to hold everything
        this.inventoryContainer = this.add.container(400, 300);
        this.inventoryContainer.setVisible(false);

        // Background
        const bg = this.add.rectangle(0, 0, 300, 200, 0x000000, 0.8);
        this.inventoryContainer.add(bg);

        // Title
        const title = this.add.text(0, -80, 'Inventory', {
            fontSize: '24px',
            fontFamily: '"Courier New", Courier, monospace',
            fill: '#ffffff'
        }).setOrigin(0.5);
        this.inventoryContainer.add(title);

        // Apple Icon in Window
        const appleIcon = this.add.image(-50, 0, 'apple').setScale(0.2); // Bigger apple
        this.inventoryContainer.add(appleIcon);

        // Apple Count in Window
        this.windowAppleText = this.add.text(20, 0, 'Apples: 0', {
            fontSize: '20px',
            fontFamily: '"Courier New", Courier, monospace',
            fill: '#ffffff'
        }).setOrigin(0, 0.5);
        this.inventoryContainer.add(this.windowAppleText);

        // Close Hint
        const closeHint = this.add.text(0, 80, '(Click Backpack to Close)', {
            fontSize: '12px',
            fontFamily: '"Courier New", Courier, monospace',
            fill: '#aaaaaa'
        }).setOrigin(0.5);
        this.inventoryContainer.add(closeHint);

        // --- Interactions ---
        this.backpack.on('pointerdown', () => {
            this.toggleInventory();
        });

        // Listen for events from MainScene
        const mainScene = this.scene.get('MainScene');

        // We need to wait for MainScene to be ready or just listen globally if careful
        // Better pattern: Listen on the main scene's event emitter once it exists.
        // But since both are started, let's just use the game-wide registry or get the scene.

        mainScene.events.on('updateAppleCount', (count) => {
            this.updateAppleCount(count);
        });

        mainScene.events.on('collectAppleAnim', () => {
            this.pulseBackpack();
        });

        mainScene.events.on('updateCoinCount', (count) => {
            this.updateCoinCount(count);
        });

        this.createCoinHUD();
        this.createStore();
        this.createDragonMenu();

        mainScene.events.on('showDragonMenu', () => {
            console.log('Event received in UIScene');
            this.toggleDragonMenu();
        });

        // Listen for stats updates
        mainScene.events.on('updateStats', (stats) => {
            this.updateStatusBars(stats);
        });

        // Use default stats if mainScene hasn't initialized them yet
        const initialStats = mainScene.stats || { love: 20, hunger: 80, energy: 100, level: 1 };
        this.createStatusPage(initialStats);
        this.createFighterSelection();
    }

    toggleInventory() {
        this.inventoryOpen = !this.inventoryOpen;
        this.inventoryContainer.setVisible(this.inventoryOpen);
    }

    updateAppleCount(count) {
        this.appleText.setText(count.toString());
        if (this.windowAppleText) {
            this.windowAppleText.setText(`Apples: ${count}`);
        }
    }

    pulseBackpack() {
        this.tweens.add({
            targets: this.backpack,
            scale: 0.2, // Pulse effect
            duration: 100,
            yoyo: true,
            onComplete: () => {
                this.backpack.setScale(0.15); // Return to normal
            }
        });
    }

    // --- GAME STORE & COINS ---

    createCoinHUD() {
        // Coin Icon (Below Backpack)
        this.coinIcon = this.add.image(750, 220, 'coin'); // Under the backpack
        this.coinIcon.setScale(0.15);

        // Coin Text
        this.coinText = this.add.text(750, 220, '0', {
            fontSize: '26px',
            fontFamily: '"Courier New", Courier, monospace',
            fill: '#FFD700', // Gold color
            stroke: '#000000',
            strokeThickness: 4,
            fontStyle: 'bold'
        }).setOrigin(0.5);
    }

    createStore() {
        // Shopping Cart Icon (Bottom Right)
        this.cart = this.add.image(750, 550, 'cart'); // Bottom right
        this.cart.setScale(0.15);
        this.cart.setInteractive({ useHandCursor: true });

        // Store Window (Hidden by default)
        this.storeOpen = false;
        this.storeContainer = this.add.container(400, 300);
        this.storeContainer.setVisible(false);

        // Background
        const bg = this.add.rectangle(0, 0, 500, 400, 0x2a1a08, 0.95); // Dark brown wood style
        bg.setStrokeStyle(4, 0xd4af37); // Gold border
        this.storeContainer.add(bg);

        // Title
        const title = this.add.text(0, -160, 'Dragon Store', {
            fontSize: '32px',
            fontFamily: '"Courier New", Courier, monospace',
            fill: '#EFD469',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.storeContainer.add(title);

        // Close Hint
        const closeHint = this.add.text(0, 180, '(Click Cart to Close)', {
            fontSize: '14px',
            fill: '#aaaaaa'
        }).setOrigin(0.5);
        this.storeContainer.add(closeHint);

        // Toggle Logic
        this.cart.on('pointerdown', () => {
            this.toggleStore();
        });
    }

    toggleStore() {
        this.storeOpen = !this.storeOpen;
        this.storeContainer.setVisible(this.storeOpen);

        // Close inventory if open
        if (this.storeOpen && this.inventoryOpen) {
            this.toggleInventory();
        }
    }

    updateCoinCount(count) {
        if (this.coinText) this.coinText.setText(count.toString());
    }

    createDragonMenu() {
        this.dragonMenuOpen = false;
        this.dragonMenuContainer = this.add.container(400, 300);
        this.dragonMenuContainer.setVisible(false);

        // Background
        const bg = this.add.rectangle(0, 0, 300, 450, 0x1a1a1a, 0.9);
        bg.setStrokeStyle(2, 0xffffff);
        this.dragonMenuContainer.add(bg);

        // Title
        const title = this.add.text(0, -140, 'Dragon Menu', {
            fontSize: '28px',
            fontFamily: '"Courier New", Courier, monospace',
            fill: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.dragonMenuContainer.add(title);

        // Options
        const options = ['Feed', 'Pet', 'Fight', 'Status', 'Close'];
        options.forEach((opt, index) => {
            const btn = this.add.text(0, -60 + (index * 60), opt, {
                fontSize: '22px',
                fontFamily: '"Courier New", Courier, monospace',
                fill: '#ffffff',
                backgroundColor: '#333333',
                padding: { x: 20, y: 10 }
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });

            btn.on('pointerover', () => btn.setStyle({ fill: '#ffff00' }));
            btn.on('pointerout', () => btn.setStyle({ fill: '#ffffff' }));
            
            btn.on('pointerdown', () => {
                if (opt === 'Close') {
                    this.toggleDragonMenu();
                } else {
                    console.log(`Action: ${opt}`);
                    // You could emit events back to MainScene or handle logic here
                    if (opt === 'Feed') {
                        this.handleFeed();
                        this.toggleDragonMenu();
                    } else if (opt === 'Pet') {
                        const mainScene = this.scene.get('MainScene');
                        mainScene.events.emit('petDragon');
                        this.toggleDragonMenu();
                    } else if (opt === 'Fight') {
                        this.toggleFighterSelection();
                        this.toggleDragonMenu();
                    } else if (opt === 'Status') {
                        this.toggleStatusPage();
                        this.toggleDragonMenu();
                    }
                }
            });

            this.dragonMenuContainer.add(btn);
        });
    }

    toggleDragonMenu() {
        this.dragonMenuOpen = !this.dragonMenuOpen;
        this.dragonMenuContainer.setVisible(this.dragonMenuOpen);

        if (this.dragonMenuOpen) {
            if (this.inventoryOpen) this.toggleInventory();
            if (this.storeOpen) this.toggleStore();
        }
    }

    handleFeed() {
        const mainScene = this.scene.get('MainScene');
        if (mainScene.apples > 0) {
            mainScene.apples--;
            
            // Ensure stats exist before updating
            if (!mainScene.stats) {
                mainScene.stats = { love: 20, hunger: 80, energy: 100, level: 1 };
            }
            
            mainScene.stats.hunger = Math.min(100, mainScene.stats.hunger + 15);
            mainScene.events.emit('updateAppleCount', mainScene.apples);
            mainScene.events.emit('updateStats', mainScene.stats);
            
            // Add a little feedback
            const feedback = this.add.text(400, 200, 'Yum! +1 Happy', {
                fontSize: '20px',
                fill: '#00ff00'
            }).setOrigin(0.5);
            
            this.tweens.add({
                targets: feedback,
                y: 150,
                alpha: 0,
                duration: 1000,
                onComplete: () => feedback.destroy()
            });
        } else {
            const feedback = this.add.text(400, 200, 'No Apples!', {
                fontSize: '20px',
                fill: '#ff0000'
            }).setOrigin(0.5);
            
            this.tweens.add({
                targets: feedback,
                y: 150,
                alpha: 0,
                duration: 1000,
                onComplete: () => feedback.destroy()
            });
        }
    }

    // --- STATUS PAGE ---

    createStatusPage(stats) {
        this.statusOpen = false;
        this.statusContainer = this.add.container(400, 300);
        this.statusContainer.setVisible(false);

        // Background - Glassmorphism style
        const bg = this.add.rectangle(0, 0, 400, 450, 0x000000, 0.85);
        bg.setStrokeStyle(3, 0x00ff00); // Neon green border
        this.statusContainer.add(bg);

        // Title
        const title = this.add.text(0, -190, 'Dragon Status', {
            fontSize: '32px',
            fontFamily: '"Courier New", Courier, monospace',
            fill: '#00ff00',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.statusContainer.add(title);

        // Dragon Level Info
        this.levelText = this.add.text(0, -140, `Level ${stats.level} Dragon`, {
            fontSize: '24px',
            fontFamily: '"Courier New", Courier, monospace',
            fill: '#ffffff'
        }).setOrigin(0.5);
        this.statusContainer.add(this.levelText);

        // --- STAT BARS ---
        
        // 1. Love Bar (The Main Request)
        this.statusContainer.add(this.add.text(-150, -80, 'Love', { fontSize: '20px', fill: '#ff69b4' }));
        this.loveBarBg = this.add.rectangle(50, -70, 200, 25, 0x333333).setOrigin(0.5);
        this.loveBar = this.add.rectangle(-50, -70, 0, 25, 0xff69b4).setOrigin(0, 0.5);
        this.loveText = this.add.text(170, -70, `${stats.love}%`, { fontSize: '18px', fill: '#ff69b4' }).setOrigin(0.5);
        this.statusContainer.add([this.loveBarBg, this.loveBar, this.loveText]);

        // 2. Hunger Bar
        this.statusContainer.add(this.add.text(-150, -20, 'Hunger', { fontSize: '20px', fill: '#ffa500' }));
        this.hungerBarBg = this.add.rectangle(50, -10, 200, 25, 0x333333).setOrigin(0.5);
        this.hungerBar = this.add.rectangle(-50, -10, 0, 25, 0xffa500).setOrigin(0, 0.5);
        this.hungerText = this.add.text(170, -10, `${stats.hunger}%`, { fontSize: '18px', fill: '#ffa500' }).setOrigin(0.5);
        this.statusContainer.add([this.hungerBarBg, this.hungerBar, this.hungerText]);

        // 3. Energy Bar
        this.statusContainer.add(this.add.text(-150, 40, 'Energy', { fontSize: '20px', fill: '#00ffff' }));
        this.energyBarBg = this.add.rectangle(50, 50, 200, 25, 0x333333).setOrigin(0.5);
        this.energyBar = this.add.rectangle(-50, 50, 0, 25, 0x00ffff).setOrigin(0, 0.5);
        this.energyText = this.add.text(170, 50, `${stats.energy}%`, { fontSize: '18px', fill: '#00ffff' }).setOrigin(0.5);
        this.statusContainer.add([this.energyBarBg, this.energyBar, this.energyText]);

        // Close Button
        const closeBtn = this.add.text(0, 160, 'Close', {
            fontSize: '22px',
            fill: '#ffffff',
            backgroundColor: '#ff0000',
            padding: { x: 30, y: 10 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        closeBtn.on('pointerdown', () => this.toggleStatusPage());
        this.statusContainer.add(closeBtn);

        // Initial Bar Update
        this.updateStatusBars(stats);
    }

    toggleStatusPage() {
        this.statusOpen = !this.statusOpen;
        this.statusContainer.setVisible(this.statusOpen);
    }

    updateStatusBars(stats) {
        if (!this.statusContainer) return;

        // Update Widths (Max width is 200)
        this.loveBar.width = (stats.love / 100) * 200;
        this.hungerBar.width = (stats.hunger / 100) * 200;
        this.energyBar.width = (stats.energy / 100) * 200;

        // Update Texts
        this.loveText.setText(`${Math.round(stats.love)}%`);
        this.hungerText.setText(`${Math.round(stats.hunger)}%`);
        this.energyText.setText(`${Math.round(stats.energy)}%`);
        this.levelText.setText(`Level ${stats.level} Dragon`);
    }

    // --- FIGHTER SELECTION ---

    createFighterSelection() {
        this.selectionOpen = false;
        this.selectionContainer = this.add.container(400, 300);
        this.selectionContainer.setVisible(false);

        // Background
        const bg = this.add.rectangle(0, 0, 600, 400, 0x000000, 0.9);
        bg.setStrokeStyle(3, 0xff0000); // Red for battle
        this.selectionContainer.add(bg);

        // Title
        const title = this.add.text(0, -160, 'Choose Your Fighter', {
            fontSize: '32px',
            fontFamily: '"Courier New", Courier, monospace',
            fill: '#ff0000',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.selectionContainer.add(title);

        const fighters = [
            { name: 'Fire Dragon', key: 'dragon_fire', x: -180 },
            { name: 'Ice Dragon', key: 'dragon_ice', x: 0 },
            { name: 'Storm Dragon', key: 'dragon_storm', x: 180 }
        ];

        fighters.forEach(f => {
            const dragonImg = this.add.image(f.x, -20, f.key).setScale(0.12);
            dragonImg.setInteractive({ useHandCursor: true });
            
            const nameText = this.add.text(f.x, 80, f.name, {
                fontSize: '18px',
                fill: '#ffffff'
            }).setOrigin(0.5);

            const selectBtn = this.add.text(f.x, 130, 'SELECT', {
                fontSize: '20px',
                fill: '#ffffff',
                backgroundColor: '#333333',
                padding: { x: 15, y: 5 }
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });

            dragonImg.on('pointerdown', () => this.handleSelection(f.name));
            selectBtn.on('pointerdown', () => this.handleSelection(f.name));

            dragonImg.on('pointerover', () => dragonImg.setScale(0.14));
            dragonImg.on('pointerout', () => dragonImg.setScale(0.12));

            this.selectionContainer.add([dragonImg, nameText, selectBtn]);
        });

        // Close
        const closeBtn = this.add.text(0, 180, 'Cancel', { fontSize: '16px', fill: '#aaaaaa' })
            .setOrigin(0.5).setInteractive({ useHandCursor: true });
        closeBtn.on('pointerdown', () => this.toggleFighterSelection());
        this.selectionContainer.add(closeBtn);
    }

    toggleFighterSelection() {
        this.selectionOpen = !this.selectionOpen;
        this.selectionContainer.setVisible(this.selectionOpen);
    }

    handleSelection(dragonName) {
        console.log(`Chosen: ${dragonName}`);
        
        // Map dragon name to key
        let dragonKey = 'dragon_fire';
        if (dragonName === 'Ice Dragon') dragonKey = 'dragon_ice';
        if (dragonName === 'Storm Dragon') dragonKey = 'dragon_storm';

        // Pause current gameplay
        this.scene.pause('MainScene');
        this.scene.pause('UIScene');
        
        // Start Battle Arena
        this.scene.launch('BattleScene', { 
            dragonName: dragonName, 
            dragonKey: dragonKey 
        });

        this.toggleFighterSelection();
    }
}
