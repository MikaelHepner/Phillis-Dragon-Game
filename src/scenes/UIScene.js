import Phaser from 'phaser';

export default class UIScene extends Phaser.Scene {
    constructor() {
        super({ key: 'UIScene' });
    }

    create() {
        // Our game is 800x600.
        // This scene will NOT zoom, so (750, 50) is actually top-right.

        // Backpack Icon
        this.backpack = this.add.image(750, 60, 'backpack');
        this.backpack.setScale(0.15);
        this.backpack.setInteractive({ useHandCursor: true });

        // Apple Counter Text (HUD)
        this.appleText = this.add.text(750, 60, '0', {
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

        mainScene.events.on('updateApples', (count) => {
            this.updateAppleCount(count);
        });

        mainScene.events.on('collectAppleAnim', () => {
            this.pulseBackpack();
        });

        mainScene.events.on('updateCoinCount', (count) => {
            this.updateCoinCount(count);
        });

        mainScene.events.on('updateWoodCount', (count) => {
            this.updateWoodCount(count);
        });

        mainScene.events.on('updateFishCount', (count) => {
            this.updateFishCount(count);
        });

        this.createCoinHUD();
        this.createWoodHUD();
        this.createFishHUD();
        this.createStore();
        this.createCraftingMenu();
        this.createBuildMenu();
        this.createDragonMenu();

        mainScene.events.on('showDragonMenu', (dragon) => {
            console.log('Event received in UIScene for:', dragon.name);
            this.activeDragon = dragon;
            this.toggleDragonMenu();
        });

        mainScene.events.on('refreshActiveStats', () => {
            if (this.activeDragon && this.activeDragon.stats) {
                this.updateStatusBars(this.activeDragon.stats);
            }
        });

        // Listen for stats updates
        mainScene.events.on('updateStats', (stats) => {
            this.updateStatusBars(stats);
        });

        // Use default stats if mainScene hasn't initialized them yet
        const initialStats = (this.activeDragon && this.activeDragon.stats) || { love: 20, hunger: 80, energy: 100, level: 1 };
        this.createStatusPage(initialStats);
        this.createFighterSelection();
        this.createPackStore();
        this.selectedCardIndex = null;
    }

    toggleInventory() {
        const wasOpen = this.inventoryOpen;
        this.closeAllMenus();
        this.inventoryOpen = !wasOpen;
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
        this.coinIcon = this.add.image(750, 140, 'coin'); // Under the backpack
        this.coinIcon.setScale(0.15);

        // Coin Text
        this.coinText = this.add.text(750, 140, '0', {
            fontSize: '26px',
            fontFamily: '"Courier New", Courier, monospace',
            fill: '#FFD700', // Gold color
            stroke: '#000000',
            strokeThickness: 4,
            fontStyle: 'bold'
        }).setOrigin(0.5);
    }

    createStore() {
        // Shopping Cart Icon (Bottom Right area)
        this.cart = this.add.image(750, 390, 'cart'); 
        this.cart.setScale(0.15);
        this.cart.setInteractive({ useHandCursor: true });

        // Crafting Button (Hammer icon)
        this.craftBtn = this.add.container(750, 480);
        const craftBg = this.add.circle(0, 0, 35, 0x4a4a4a).setInteractive({ useHandCursor: true });
        const craftText = this.add.text(0, 0, '⚒️', { fontSize: '32px' }).setOrigin(0.5);
        this.craftBtn.add([craftBg, craftText]);
        
        craftBg.on('pointerdown', () => this.toggleCraftingMenu());
        craftBg.on('pointerover', () => craftBg.setFillStyle(0x666666));
        craftBg.on('pointerout', () => craftBg.setFillStyle(0x4a4a4a));

        // Build Button (House/Construction icon)
        this.buildBtn = this.add.container(750, 570);
        const buildBg = this.add.circle(0, 0, 35, 0x1e3a5f).setInteractive({ useHandCursor: true });
        const buildText = this.add.text(0, 0, '🏗️', { fontSize: '32px' }).setOrigin(0.5);
        this.buildBtn.add([buildBg, buildText]);
        
        buildBg.on('pointerdown', () => this.toggleBuildMenu());
        buildBg.on('pointerover', () => buildBg.setFillStyle(0x2a508a));
        buildBg.on('pointerout', () => buildBg.setFillStyle(0x1e3a5f));

        // Store Window (Hidden by default)
        this.storeOpen = false;
        this.storeContainer = this.add.container(400, 300);
        this.storeContainer.setVisible(false);

        // Background
        const bg = this.add.rectangle(0, 0, 700, 450, 0x2a1a08, 0.95); // Wider for more dragons
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

        // Pack Button (Top Right)
        const packBtn = this.add.text(330, -210, 'PACK', {
            fontSize: '20px',
            fontFamily: '"Courier New", Courier, monospace',
            fill: '#ffffff',
            backgroundColor: '#d4af37', // Match the gold border
            padding: { x: 15, y: 5 },
            fontStyle: 'bold'
        }).setOrigin(1, 0).setInteractive({ useHandCursor: true });

        packBtn.on('pointerdown', () => {
            this.toggleStore(); // Close main store
            this.togglePackStore(); // Open pack store
        });

        this.storeContainer.add(packBtn);

        // Store Items
        this.renderStoreItems();

        // Toggle Logic
        this.cart.on('pointerdown', () => {
            this.toggleStore();
        });
    }

    renderStoreItems() {
        // Clear existing items if any
        if (this.storeItemsContainer) this.storeItemsContainer.destroy();
        this.storeItemsContainer = this.add.container(0, 0);
        this.storeContainer.add(this.storeItemsContainer);

        const items = [
            { name: 'Fire Dragon', key: 'dragon_fire', cost: 20 },
            { name: 'Ice Dragon', key: 'dragon_ice', cost: 30 },
            { name: 'Thunder Dragon', key: 'dragon_storm', cost: 40 },
            { name: 'Water Dragon', key: 'dragon_water', cost: 50 }
        ];

        const mainScene = this.scene.get('MainScene');

        items.forEach((item, index) => {
            const x = -255 + (index * 170); // Adjusted for 4 items
            const y = -30;

            const itemBg = this.add.rectangle(x, y, 120, 180, 0x3d2b1f).setStrokeStyle(2, 0xd4af37);
            
            const dragonImg = this.add.image(x, y - 30, item.key).setScale(0.1);
            const nameText = this.add.text(x, y + 25, item.name, { fontSize: '16px', fill: '#ffffff' }).setOrigin(0.5);
            const costText = this.add.text(x, y + 45, `${item.cost} Coins`, { fontSize: '14px', fill: '#FFD700' }).setOrigin(0.5);

            const alreadyOwned = mainScene.ownedDragons.some(d => d.key === item.key);
            const btnText = alreadyOwned ? 'OWNED' : 'BUY';
            const btnColor = alreadyOwned ? '#555555' : (mainScene.coins >= item.cost ? '#00aa00' : '#aa0000');

            const buyBtn = this.add.text(x, y + 75, btnText, {
                fontSize: '18px',
                fill: '#ffffff',
                backgroundColor: btnColor,
                padding: { x: 10, y: 5 }
            }).setOrigin(0.5);

            if (!alreadyOwned && mainScene.coins >= item.cost) {
                buyBtn.setInteractive({ useHandCursor: true });
                buyBtn.on('pointerdown', () => this.buyDragon(item));
            }

            this.storeItemsContainer.add([itemBg, dragonImg, nameText, costText, buyBtn]);
        });
    }

    buyDragon(item) {
        const mainScene = this.scene.get('MainScene');
        if (mainScene.coins >= item.cost) {
            mainScene.coins -= item.cost;
            mainScene.ownedDragons.push({ name: item.name, key: item.key });
            mainScene.events.emit('dragonAdded', { name: item.name, key: item.key });
            
            // Update HUD
            this.updateCoinCount(mainScene.coins);
            
            // Re-render store to update "BUY" to "OWNED"
            this.renderStoreItems();

            // Feedback
            const feedback = this.add.text(400, 100, `Bought ${item.name}!`, {
                fontSize: '24px',
                fill: '#00ff00',
                backgroundColor: '#000000'
            }).setOrigin(0.5);

            this.tweens.add({
                targets: feedback,
                y: 50,
                alpha: 0,
                duration: 2000,
                onComplete: () => feedback.destroy()
            });
        }
    }

    toggleStore() {
        const wasOpen = this.storeOpen;
        this.closeAllMenus();
        this.storeOpen = !wasOpen;
        this.storeContainer.setVisible(this.storeOpen);

        if (this.storeOpen) {
            this.renderStoreItems(); // Refresh on open
        }
    }

    updateCoinCount(count) {
        if (this.coinText) this.coinText.setText(count.toString());
    }

    createWoodHUD() {
        // Wood Icon (Below Coin HUD)
        this.woodIcon = this.add.image(750, 220, 'tree'); 
        this.woodIcon.setScale(0.08);

        // Wood Text
        this.woodText = this.add.text(750, 220, '0', {
            fontSize: '26px',
            fontFamily: '"Courier New", Courier, monospace',
            fill: '#8b4513', // Brown wood color
            stroke: '#000000',
            strokeThickness: 4,
            fontStyle: 'bold'
        }).setOrigin(0.5);
    }

    updateWoodCount(count) {
        if (this.woodText) this.woodText.setText(count.toString());
    }

    createFishHUD() {
        // Fish Icon (Below Wood HUD)
        this.fishIcon = this.add.image(750, 300, 'fishing_rod'); 
        this.fishIcon.setScale(0.08);

        // Fish Text
        this.fishText = this.add.text(750, 300, '0', {
            fontSize: '26px',
            fontFamily: '"Courier New", Courier, monospace',
            fill: '#00ffff', // Cyan fish color
            stroke: '#000000',
            strokeThickness: 4,
            fontStyle: 'bold'
        }).setOrigin(0.5);
    }

    updateFishCount(count) {
        if (this.fishText) this.fishText.setText(count.toString());
    }

    createPackStore() {
        this.packStoreOpen = false;
        this.packStoreContainer = this.add.container(400, 300);
        this.packStoreContainer.setVisible(false);

        // Background
        const bg = this.add.rectangle(0, 0, 700, 450, 0x1a0a2a, 0.95); 
        bg.setStrokeStyle(4, 0x00ffff); // Cyan border
        this.packStoreContainer.add(bg);

        // Title
        const title = this.add.text(0, -160, 'Pack Store', {
            fontSize: '32px',
            fontFamily: '"Courier New", Courier, monospace',
            fill: '#00ffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.packStoreContainer.add(title);

        // Pack Image
        const packImg = this.add.image(0, -30, 'pack').setScale(0.3);
        packImg.setInteractive({ useHandCursor: true });
        this.packStoreContainer.add(packImg);

        const packName = this.add.text(0, 80, 'Dragon Booster Pack', {
            fontSize: '24px',
            fill: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.packStoreContainer.add(packName);

        const packCost = this.add.text(0, 110, '10 Coins', {
            fontSize: '20px',
            fill: '#FFD700'
        }).setOrigin(0.5);
        this.packStoreContainer.add(packCost);

        const buyPackBtn = this.add.text(0, 145, 'OPEN PACK', {
            fontSize: '22px',
            fill: '#ffffff',
            backgroundColor: '#00aa00',
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        const handleOpen = () => this.openPack();
        buyPackBtn.on('pointerdown', handleOpen);
        packImg.on('pointerdown', handleOpen);

        this.packStoreContainer.add(buyPackBtn);

        // Close Button
        const backBtn = this.add.text(0, 180, 'Back to Store', {
            fontSize: '22px',
            fill: '#ffffff',
            backgroundColor: '#ff0000',
            padding: { x: 30, y: 10 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        backBtn.on('pointerdown', () => {
            this.togglePackStore();
            this.toggleStore();
        });
        this.packStoreContainer.add(backBtn);
    }

    togglePackStore() {
        const wasOpen = this.packStoreOpen;
        this.closeAllMenus();
        this.packStoreOpen = !wasOpen;
        this.packStoreContainer.setVisible(this.packStoreOpen);
    }

    openPack() {
        const mainScene = this.scene.get('MainScene');
        if (mainScene.coins < 10) {
            const feedback = this.add.text(400, 100, 'Not enough coins!', {
                fontSize: '26px',
                fill: '#ff0000',
                backgroundColor: '#000000'
            }).setOrigin(0.5);
            
            this.tweens.add({
                targets: feedback,
                y: 50,
                alpha: 0,
                duration: 2000,
                onComplete: () => feedback.destroy()
            });
            return;
        }

        mainScene.coins -= 10;
        this.updateCoinCount(mainScene.coins);

        // Card types and items
        const cardTypes = [
            { name: 'Delicious Food', type: 'Food', key: 'apple' },
            { name: 'Ancient Tree', type: 'Trees', key: 'tree' },
            { name: 'Fishing Rod', type: 'Fishing', key: 'fishing_rod' },
            { name: 'Apple Seeds', type: 'Farming', key: 'apple' },
            { name: 'Dragon Head', type: 'Part', key: 'part_head' },
            { name: 'Dragon Wings', type: 'Part', key: 'part_wings' },
            { name: 'Dragon Tail', type: 'Part', key: 'part_tail' },
            { name: 'Dragon Body', type: 'Part', key: 'part_body' }
        ];

        // Randomly pick 3 (can be duplicates)
        const result = [];
        for (let i = 0; i < 3; i++) {
            result.push(cardTypes[Math.floor(Math.random() * cardTypes.length)]);
        }

        this.showPackResult(result);
    }

    showPackResult(cards) {
        const resultContainer = this.add.container(400, 300);
        
        // Dark overlay
        const overlay = this.add.rectangle(0, 0, 800, 600, 0x000000, 0.85).setInteractive();
        resultContainer.add(overlay);

        const title = this.add.text(0, -220, 'PACK UNLOCKED!', {
            fontSize: '42px',
            fontFamily: '"Courier New", Courier, monospace',
            fill: '#00ffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5);
        resultContainer.add(title);

        cards.forEach((card, i) => {
            const x = (i - 1) * 220;
            const cardGroup = this.add.container(x, 0);
            
            const cardBg = this.add.rectangle(0, 0, 180, 260, 0x1a1a1a).setStrokeStyle(4, 0x00ffff);
            const cardImg = this.add.image(0, -30, card.key).setScale(0.25);
            const nameText = this.add.text(0, 60, card.name, { fontSize: '20px', fill: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
            const typeText = this.add.text(0, 90, card.type.toUpperCase(), { fontSize: '16px', fill: '#aaaaaa' }).setOrigin(0.5);
            
            cardGroup.add([cardBg, cardImg, nameText, typeText]);
            resultContainer.add(cardGroup);

            // Animation
            cardGroup.setScale(0);
            this.tweens.add({
                targets: cardGroup,
                scale: 1,
                delay: i * 300,
                duration: 600,
                ease: 'Back.easeOut'
            });
        });

        const closeBtn = this.add.text(0, 220, 'COLLECT ALL', {
            fontSize: '26px',
            fill: '#ffffff',
            backgroundColor: '#00aa00',
            padding: { x: 40, y: 15 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        closeBtn.on('pointerdown', () => {
            const mainScene = this.scene.get('MainScene');
            mainScene.ownedCards.push(...cards);
            resultContainer.destroy();
        });
        
        closeBtn.on('pointerover', () => closeBtn.setScale(1.1));
        closeBtn.on('pointerout', () => closeBtn.setScale(1));
        
        resultContainer.add(closeBtn);
    }

    createDragonMenu() {
        this.dragonMenuOpen = false;
        this.dragonMenuContainer = this.add.container(400, 300);
        this.dragonMenuContainer.setVisible(false);

        // Background
        const bg = this.add.rectangle(0, 0, 300, 500, 0x1a1a1a, 0.9);
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
            const btn = this.add.text(0, -100 + (index * 60), opt, {
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
                        mainScene.events.emit('petDragon', this.activeDragon);
                        this.toggleDragonMenu();
                    } else if (opt === 'Fight') {
                        this.toggleFighterSelection();
                    } else if (opt === 'Status') {
                        this.toggleStatusPage();
                    }
                }
            });

            this.dragonMenuContainer.add(btn);
        });
    }

    toggleDragonMenu() {
        const wasOpen = this.dragonMenuOpen;
        this.closeAllMenus();
        this.dragonMenuOpen = !wasOpen;
        this.dragonMenuContainer.setVisible(this.dragonMenuOpen);
    }

    handleFeed() {
        const mainScene = this.scene.get('MainScene');
        if (mainScene.apples > 0 && this.activeDragon) {
            mainScene.apples--;
            
            this.activeDragon.stats.hunger = Math.min(100, this.activeDragon.stats.hunger + 15);
            mainScene.events.emit('updateApples', mainScene.apples);
            mainScene.events.emit('updateStats', this.activeDragon.stats);
            
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
        const wasOpen = this.statusOpen;
        this.closeAllMenus();
        this.statusOpen = !wasOpen;
        this.statusContainer.setVisible(this.statusOpen);
        
        if (this.statusOpen && this.activeDragon && this.activeDragon.stats) {
            this.updateStatusBars(this.activeDragon.stats);
        }
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
        this.selectionMode = 'opponent'; 
        this.selectedOpponent = null;
        this.selectedTeam = [null, null, null];
        
        this.selectionContainer = this.add.container(400, 300);
        this.selectionContainer.setVisible(false);

        // Background
        const bg = this.add.rectangle(0, 0, 600, 450, 0x000000, 0.9);
        bg.setStrokeStyle(3, 0xff0000); 
        this.selectionContainer.add(bg);

        // Title
        this.selectionTitle = this.add.text(0, -180, 'Select Opponent', {
            fontSize: '32px',
            fontFamily: '"Courier New", Courier, monospace',
            fill: '#ff0000',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.selectionContainer.add(this.selectionTitle);

        // View Container (Dynamic content)
        this.selectionView = this.add.container(0, 0);
        this.selectionContainer.add(this.selectionView);

        // Close Button
        const closeBtn = this.add.text(0, 190, 'Cancel', { fontSize: '18px', fill: '#aaaaaa' })
            .setOrigin(0.5).setInteractive({ useHandCursor: true });
        closeBtn.on('pointerdown', () => this.toggleFighterSelection());
        this.selectionContainer.add(closeBtn);

        // Initial Render
        this.renderOpponentSelection();
    }

    renderOpponentSelection() {
        this.selectionView.removeAll(true);
        this.selectionTitle.setText('Select Opponent');
        this.selectionTitle.setStyle({ fill: '#ff0000' });

        const fighters = [
            { name: 'Fire Dragon', key: 'dragon_fire', x: -180 },
            { name: 'Ice Dragon', key: 'dragon_ice', x: 0 },
            { name: 'Storm Dragon', key: 'dragon_storm', x: 180 }
        ];

        fighters.forEach(f => {
            const group = this.add.container(f.x, 0);
            
            const dragonImg = this.add.image(0, -20, f.key).setScale(0.12);
            dragonImg.setInteractive({ useHandCursor: true });
            
            const nameText = this.add.text(0, 80, f.name, { fontSize: '18px', fill: '#ffffff' }).setOrigin(0.5);
            const selectBtn = this.add.text(0, 130, 'SELECT', {
                fontSize: '20px',
                fill: '#ffffff',
                backgroundColor: '#333333',
                padding: { x: 15, y: 5 }
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });

            const handleSelect = () => {
                this.selectedOpponent = { name: f.name, key: f.key };
                this.selectionMode = 'player';
                this.renderTeamSelection();
            };

            dragonImg.on('pointerdown', handleSelect);
            selectBtn.on('pointerdown', handleSelect);
            
            group.add([dragonImg, nameText, selectBtn]);
            this.selectionView.add(group);
        });
    }

    renderTeamSelection() {
        this.selectionView.removeAll(true);
        this.selectionTitle.setText('Build Your Team');
        this.selectionTitle.setStyle({ fill: '#00ff00' });

        const slotSpacing = 160;
        for (let i = 0; i < 3; i++) {
            const x = (i - 1) * slotSpacing;
            
            // Slot Box
            const slotBox = this.add.rectangle(x, -20, 120, 120, 0x222222);
            slotBox.setStrokeStyle(2, 0x444444);
            slotBox.setInteractive({ useHandCursor: true });
            
            const plus = this.add.text(x, -20, '+', { fontSize: '48px', fill: '#444444' }).setOrigin(0.5);
            
            this.selectionView.add([slotBox, plus]);

            // If a dragon is already selected for this slot, show it
            if (this.selectedTeam[i]) {
                const dragon = this.add.image(x, -20, this.selectedTeam[i].key).setScale(0.1);
                this.selectionView.add(dragon);
                plus.setVisible(false);
            }

            slotBox.on('pointerdown', () => this.showDragonList(i));
        }

        // Start Battle Button
        const startBtn = this.add.text(0, 130, 'START BATTLE', {
            fontSize: '24px',
            fill: '#ffffff',
            backgroundColor: this.selectedTeam.some(t => t !== null) ? '#00aa00' : '#333333',
            padding: { x: 30, y: 10 }
        }).setOrigin(0.5);

        if (this.selectedTeam.some(t => t !== null)) {
            startBtn.setInteractive({ useHandCursor: true });
            startBtn.on('pointerdown', () => this.handleStartBattle());
        }

        this.selectionView.add(startBtn);
    }

    showDragonList(slotIndex) {
        // Simple overlay for selecting a dragon for a specific slot
        const overlay = this.add.container(0, 0);
        const bg = this.add.rectangle(0, 0, 800, 600, 0x000000, 0.7);
        bg.setInteractive(); // Block clicks below
        overlay.add(bg);

        const listBg = this.add.rectangle(0, 0, 400, 300, 0x1a1a1a);
        listBg.setStrokeStyle(2, 0xffffff);
        overlay.add(listBg);

        const title = this.add.text(0, -120, 'Choose Dragon', { fontSize: '24px', fill: '#ffffff' }).setOrigin(0.5);
        overlay.add(title);

        const mainScene = this.scene.get('MainScene');
        const options = mainScene.ownedDragons || [{ name: 'Phillis', key: 'dragon' }];

        options.forEach((opt, idx) => {
            const y = -40 + (idx * 60);
            const btn = this.add.text(0, y, opt.name, {
                fontSize: '20px',
                fill: '#ffffff',
                backgroundColor: '#333333',
                padding: { x: 20, y: 5 }
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });

            btn.on('pointerdown', () => {
                this.selectedTeam[slotIndex] = opt;
                overlay.destroy();
                this.renderTeamSelection();
            });

            overlay.add(btn);
        });

        const cancel = this.add.text(0, 120, 'Cancel', { fontSize: '16px', fill: '#aaaaaa' })
            .setOrigin(0.5).setInteractive({ useHandCursor: true });
        cancel.on('pointerdown', () => overlay.destroy());
        overlay.add(cancel);

        this.selectionContainer.add(overlay);
    }

    handleStartBattle() {
        // Filter out null slots
        const team = this.selectedTeam.filter(t => t !== null);
        if (team.length === 0) return;

        // Pause current gameplay
        this.scene.pause('MainScene');
        this.scene.pause('UIScene');
        
        // Start Battle Arena
        this.scene.launch('BattleScene', { 
            opponentName: this.selectedOpponent.name, 
            opponentKey: this.selectedOpponent.key,
            playerTeam: team
        });

        // Reset for next time
        this.selectedTeam = [null, null, null];
        this.selectionMode = 'opponent';
        this.renderOpponentSelection();
        this.toggleFighterSelection();
    }

    toggleFighterSelection() {
        const wasOpen = this.selectionOpen;
        this.closeAllMenus();
        this.selectionOpen = !wasOpen;
        this.selectionContainer.setVisible(this.selectionOpen);
        if (this.selectionOpen) {
            this.selectionMode = 'opponent';
            this.renderOpponentSelection();
        }
    }

    // --- CRAFTING MENU (Old Build Menu) ---

    createCraftingMenu() {
        this.craftingMenuOpen = false;
        this.craftingMenuContainer = this.add.container(400, 300);
        this.craftingMenuContainer.setVisible(false);

        // Background
        const bg = this.add.rectangle(0, 0, 700, 450, 0x0a1a0a, 0.95);
        bg.setStrokeStyle(4, 0x00ff00);
        this.craftingMenuContainer.add(bg);
        // Title
        const title = this.add.text(0, -160, 'CRAFTING CENTER', {
            fontSize: '32px',
            fontFamily: '"Courier New", Courier, monospace',
            fill: '#00ffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.craftingMenuContainer.add(title);

        // Subtitle
        const subtitle = this.add.text(0, -120, 'Your Cards Inventory', {
            fontSize: '18px',
            fill: '#ffffff'
        }).setOrigin(0.5);
        this.craftingMenuContainer.add(subtitle);

        // Items Container
        this.craftingItemsContainer = this.add.container(0, 0);
        this.craftingMenuContainer.add(this.craftingItemsContainer);

        // Close Button
        const closeBtn = this.add.text(0, 180, 'Close', {
            fontSize: '22px',
            fill: '#ffffff',
            backgroundColor: '#ff0000',
            padding: { x: 30, y: 10 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        closeBtn.on('pointerdown', () => this.toggleCraftingMenu());
        this.craftingMenuContainer.add(closeBtn);
    }

    renderCraftingItems() {
        this.craftingItemsContainer.removeAll(true);
        const mainScene = this.scene.get('MainScene');
        const cards = mainScene.ownedCards || [];

        // Grid layout
        if (cards.length === 0) {
            const emptyText = this.add.text(0, -40, 'No cards collected yet.\nOpen packs in the Store!', {
                fontSize: '20px',
                fill: '#aaaaaa',
                align: 'center'
            }).setOrigin(0.5);
            this.craftingItemsContainer.add(emptyText);
        } else {
            const cols = 4;
            const spacingX = 160;
            const spacingY = 100;
            const startX = -((cols - 1) * spacingX) / 2;
            const startY = -40;

            cards.forEach((card, index) => {
                const col = index % cols;
                const row = Math.floor(index / cols);
                const x = startX + col * spacingX;
                const y = startY + row * spacingY;

                const cardGroup = this.add.container(x, y);
                
                // 1. Add Background FIRST
                const cardBg = this.add.rectangle(0, 0, 140, 80, 0x1a1a1a).setStrokeStyle(2, 0x00ff00);
                cardGroup.add(cardBg);

                // 2. Icon rendering
                if (card.type === 'Combo' && card.parts) {
                    const comboKey = card.parts.length === 2 ? 'combo_2' : (card.parts.length === 3 ? 'combo_3' : card.key);
                    const comboImg = this.add.image(-40, 0, comboKey).setScale(0.045);
                    cardGroup.add(comboImg);
                    
                    card.parts.forEach((partKey, i) => {
                        const icon = this.add.image(-60 + (i * 15), 30, partKey).setScale(0.015);
                        cardGroup.add(icon);
                    });
                } else {
                    const cardImg = this.add.image(-40, 0, card.key).setScale(0.045);
                    cardGroup.add(cardImg);
                }
                
                // 3. Text (Right side)
                const nameText = this.add.text(5, -15, card.name, { 
                    fontSize: '11px', 
                    fill: '#ffffff', 
                    fontStyle: 'bold',
                    wordWrap: { width: 85 }
                }).setOrigin(0, 0.5);
                
                const typeText = this.add.text(5, 15, card.type, { 
                    fontSize: '10px', 
                    fill: '#aaaaaa' 
                }).setOrigin(0, 0.5);
                
                cardGroup.add([nameText, typeText]);
                this.craftingItemsContainer.add(cardGroup);

                // Make card interactive
                cardBg.setInteractive({ useHandCursor: true });
                if (this.selectedCardIndex === index) {
                    cardBg.setStrokeStyle(4, 0xffff00);
                }

                cardBg.on('pointerdown', () => {
                    if (this.selectedCardIndex === null) {
                        this.selectedCardIndex = index;
                        this.renderCraftingItems();
                    } else if (this.selectedCardIndex === index) {
                        this.selectedCardIndex = null;
                        this.renderCraftingItems();
                    } else {
                        this.handleCardConnection(this.selectedCardIndex, index);
                    }
                });

                cardBg.on('pointerover', () => {
                    if (this.selectedCardIndex !== index) {
                        cardBg.setStrokeStyle(4, 0x00ffff);
                    }
                });
                cardBg.on('pointerout', () => {
                    if (this.selectedCardIndex !== index) {
                        cardBg.setStrokeStyle(2, 0x00ff00);
                    }
                });
            });
        }

        // --- Owned Dragons Section (Bottom) ---
        const dragonSectionY = 100; // Position below the cards
        const dragonTitle = this.add.text(0, dragonSectionY - 20, 'YOUR DRAGONS', {
            fontSize: '18px',
            fill: '#00ffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.craftingItemsContainer.add(dragonTitle);

        const dragons = mainScene.ownedDragons || [];
        dragons.forEach((dragon, i) => {
            const dx = -((dragons.length - 1) * 80) / 2 + (i * 80);
            const dy = dragonSectionY + 25;

            const dragonIcon = this.add.image(dx, dy, dragon.key).setScale(0.04);
            dragonIcon.setInteractive({ useHandCursor: true });
            
            const dragonName = this.add.text(dx, dy + 25, dragon.name, {
                fontSize: '10px',
                fill: '#ffffff'
            }).setOrigin(0.5);

            dragonIcon.on('pointerdown', () => {
                if (this.selectedCardIndex !== null) {
                    const mainScene = this.scene.get('MainScene');
                    const card = mainScene.ownedCards[this.selectedCardIndex];
                    
                    if (card.type === 'Trees') {
                        // 1. Remove card
                        mainScene.ownedCards.splice(this.selectedCardIndex, 1);
                        this.selectedCardIndex = null;
                        
                        // 2. Emit Event
                        mainScene.events.emit('giveTree', { dragon: dragon, card: card });
                        
                        // 3. Feedback
                        this.showGiveFeedback(card.name, dragon.name);

                        // 4. Refresh
                        this.renderCraftingItems();
                    } else if (card.type === 'Fishing') {
                        // 1. Remove card
                        mainScene.ownedCards.splice(this.selectedCardIndex, 1);
                        this.selectedCardIndex = null;
                        
                        // 2. Emit Event
                        mainScene.events.emit('giveFishingRod', { dragon: dragon, card: card });
                        
                        // 3. Feedback
                        this.showGiveFeedback(card.name, dragon.name);

                        // 4. Refresh
                        this.renderCraftingItems();
                    } else if (card.type === 'Farming' || card.type === 'Food') {
                        // 1. Remove card
                        mainScene.ownedCards.splice(this.selectedCardIndex, 1);
                        this.selectedCardIndex = null;
                        
                        // 2. Emit Event
                        mainScene.events.emit('giveAppleCard', { dragon: dragon, card: card });
                        
                        // 3. Feedback
                        this.showGiveFeedback(card.name, dragon.name);

                        // 4. Refresh
                        this.renderCraftingItems();
                    }
                }
            });

            this.craftingItemsContainer.add([dragonIcon, dragonName]);
        });

        // --- Crafting Check ---
        const requiredParts = ['part_head', 'part_wings', 'part_tail', 'part_body'];
        const ownedParts = cards.filter(c => c.type === 'Part').map(c => c.key);
        const hasAllParts = requiredParts.every(p => ownedParts.includes(p));

        if (hasAllParts) {
            const craftBtn = this.add.text(0, 165, 'CRAFT NEW DRAGON', {
                fontSize: '20px',
                fill: '#ffffff',
                backgroundColor: '#ff8c00',
                padding: { x: 15, y: 8 },
                fontStyle: 'bold'
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });

            craftBtn.on('pointerdown', () => {
                requiredParts.forEach(p => {
                    const idx = mainScene.ownedCards.findIndex(c => c.key === p);
                    if (idx !== -1) mainScene.ownedCards.splice(idx, 1);
                });

                const dragonTypes = ['Fire', 'Ice', 'Storm', 'Water'];
                const type = dragonTypes[Math.floor(Math.random() * dragonTypes.length)];
                const newDragon = { name: `Crafted ${type} Dragon`, key: `dragon_${type.toLowerCase()}` };
                mainScene.ownedDragons.push(newDragon);
                mainScene.events.emit('dragonAdded', newDragon);

                this.toggleCraftingMenu();
                
                const success = this.add.text(400, 100, `✨ CRAFTED: ${newDragon.name} ✨`, {
                    fontSize: '28px',
                    fill: '#00ff00',
                    backgroundColor: '#000000',
                    padding: { x: 20, y: 10 },
                    stroke: '#ffffff',
                    strokeThickness: 2
                }).setOrigin(0.5);
                
                this.tweens.add({
                    targets: success,
                    y: 50,
                    alpha: 0,
                    duration: 4000,
                    onComplete: () => success.destroy()
                });
            });

            this.craftingItemsContainer.add(craftBtn);
        }
    }

    // --- BUILD MENU (New System) ---

    createBuildMenu() {
        this.buildMenuOpen = false;
        this.buildMenuContainer = this.add.container(400, 300);
        this.buildMenuContainer.setVisible(false);

        // Background
        const bg = this.add.rectangle(0, 0, 700, 450, 0x1a1a2a, 0.95);
        bg.setStrokeStyle(4, 0x4a90e2); // Blue for build
        this.buildMenuContainer.add(bg);

        // Title
        const title = this.add.text(0, -160, 'CONSTRUCTION HUB', {
            fontSize: '32px',
            fontFamily: '"Courier New", Courier, monospace',
            fill: '#4a90e2',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.buildMenuContainer.add(title);

        // Build Items Container
        this.buildOptionsContainer = this.add.container(0, 0);
        this.buildMenuContainer.add(this.buildOptionsContainer);

        // Close Button
        const closeBtn = this.add.text(0, 180, 'Close', {
            fontSize: '22px',
            fill: '#ffffff',
            backgroundColor: '#ff0000',
            padding: { x: 30, y: 10 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        closeBtn.on('pointerdown', () => this.toggleBuildMenu());
        this.buildMenuContainer.add(closeBtn);
    }

    toggleBuildMenu() {
        const wasOpen = this.buildMenuOpen;
        this.closeAllMenus();
        this.buildMenuOpen = !wasOpen;
        this.buildMenuContainer.setVisible(this.buildMenuOpen);
        
        if (this.buildMenuOpen) {
            this.renderBuildOptions();
        }
    }

    renderBuildOptions() {
        this.buildOptionsContainer.removeAll(true);
        const mainScene = this.scene.get('MainScene');

        const builds = [
            { 
                name: 'Dragon House', 
                key: 'house', 
                cost: { wood: 20, fish: 1 },
                description: 'A cozy home for your dragons.'
            }
        ];

        builds.forEach((item, index) => {
            const x = 0;
            const y = -40;

            const bg = this.add.rectangle(x, y, 600, 140, 0x2c3e50).setStrokeStyle(2, 0x4a90e2);
            
            const img = this.add.image(x - 220, y, item.key).setScale(0.12);
            const nameText = this.add.text(x - 140, y - 40, item.name, { fontSize: '24px', fill: '#ffffff', fontStyle: 'bold' });
            const costText = this.add.text(x - 140, y - 5, `Cost: ${item.cost.wood} Wood, ${item.cost.fish} Fish`, { 
                fontSize: '18px', 
                fill: (mainScene.wood >= item.cost.wood && mainScene.fish >= item.cost.fish) ? '#00ff00' : '#ff5555' 
            });
            const descText = this.add.text(x - 140, y + 25, item.description, { fontSize: '15px', fill: '#cccccc', wordWrap: { width: 320 } });

            const canAfford = mainScene.wood >= item.cost.wood && mainScene.fish >= item.cost.fish;
            const btnColor = canAfford ? '#27ae60' : '#7f8c8d';
            
            const buildBtn = this.add.text(x + 210, y + 35, 'BUILD', {
                fontSize: '20px',
                fill: '#ffffff',
                backgroundColor: btnColor,
                padding: { x: 20, y: 10 },
                fontStyle: 'bold'
            }).setOrigin(0.5);

            if (canAfford) {
                buildBtn.setInteractive({ useHandCursor: true });
                buildBtn.on('pointerdown', () => {
                    mainScene.wood -= item.cost.wood;
                    mainScene.fish -= item.cost.fish;
                    
                    // Update HUD
                    this.updateWoodCount(mainScene.wood);
                    this.updateFishCount(mainScene.fish);
                    
                    // Emit event to MainScene to spawn house
                    mainScene.events.emit('buildHouse');
                    
                    // Refresh menu
                    this.renderBuildOptions();

                    // Feedback
                    const feedback = this.add.text(400, 100, `Building ${item.name}...`, {
                        fontSize: '24px',
                        fill: '#00ff00',
                        backgroundColor: '#000000'
                    }).setOrigin(0.5);

                    this.tweens.add({
                        targets: feedback,
                        y: 50,
                        alpha: 0,
                        duration: 2000,
                        onComplete: () => feedback.destroy()
                    });
                });
            }

            this.buildOptionsContainer.add([bg, img, nameText, costText, descText, buildBtn]);
        });
    }

    toggleCraftingMenu() {
        const wasOpen = this.craftingMenuOpen;
        this.closeAllMenus();
        this.craftingMenuOpen = !wasOpen;
        this.craftingMenuContainer.setVisible(this.craftingMenuOpen);
        
        if (this.craftingMenuOpen) {
            this.renderCraftingItems();
        }
    }

    showGiveFeedback(cardName, dragonName) {
        const feedback = this.add.text(400, 300, `Gave ${cardName} to ${dragonName}!`, {
            fontSize: '22px',
            fill: '#00ff00',
            backgroundColor: '#000000'
        }).setOrigin(0.5).setDepth(2000);
        
        this.tweens.add({
            targets: feedback,
            y: 250,
            alpha: 0,
            duration: 2000,
            onComplete: () => feedback.destroy()
        });
    }
    
    handleCardConnection(indexA, indexB) {
        const mainScene = this.scene.get('MainScene');
        const cards = mainScene.ownedCards;
        const cardA = cards[indexA];
        const cardB = cards[indexB];

        // 1. Check if both are parts or combos
        const isPartA = cardA.type === 'Part' || cardA.type === 'Combo';
        const isPartB = cardB.type === 'Part' || cardB.type === 'Combo';

        if (!isPartA || !isPartB) {
            // Can't connect non-parts
            this.selectedCardIndex = null;
            this.renderCraftingItems();
            return;
        }

        // 2. Extract parts from both
        const partsA = cardA.parts || [cardA.key];
        const partsB = cardB.parts || [cardB.key];

        // 3. Check for duplicates (can't connect two heads)
        const hasDuplicate = partsA.some(p => partsB.includes(p));
        if (hasDuplicate) {
            console.log('Cannot connect duplicate parts');
            this.selectedCardIndex = null;
            this.renderCraftingItems();
            return;
        }

        // 4. Merge
        const mergedParts = [...partsA, ...partsB];
        const mergedNames = mergedParts.map(p => p.replace('part_', '').toUpperCase());
        
        const newCard = {
            name: `Dragon (${mergedNames.join(', ')})`,
            type: 'Combo',
            parts: mergedParts,
            key: mergedParts.includes('part_body') ? 'part_body' : mergedParts[0] // Use body as icon if available
        };

        // 5. Success Feedback
        const feedback = this.add.text(400, 300, '✨ CONNECTED! ✨', {
            fontSize: '32px',
            fill: '#ffff00',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(1000);

        this.tweens.add({
            targets: feedback,
            y: 250,
            alpha: 0,
            duration: 1500,
            onComplete: () => feedback.destroy()
        });

        // 6. Update Inventory
        // Remove higher index first to avoid shifting
        const high = Math.max(indexA, indexB);
        const low = Math.min(indexA, indexB);
        cards.splice(high, 1);
        cards.splice(low, 1);
        
        // Add new card
        cards.push(newCard);

        // 7. Check if Full Dragon
        if (mergedParts.length === 4) {
            // Automatically craft!
            const dragonTypes = ['Fire', 'Ice', 'Storm', 'Water'];
            const type = dragonTypes[Math.floor(Phaser.Math.RND.realInRange(0, dragonTypes.length)) % dragonTypes.length];
            const newDragon = { name: `Crafted ${type} Dragon`, key: `dragon_${type.toLowerCase()}` };
            
            // Remove the combo card we just added
            cards.pop();
            
            mainScene.ownedDragons.push(newDragon);
            mainScene.events.emit('dragonAdded', newDragon);

            const success = this.add.text(400, 150, `✨ COMPLETE DRAGON: ${newDragon.name} ✨`, {
                fontSize: '28px',
                fill: '#00ff00',
                backgroundColor: '#000000',
                padding: { x: 20, y: 10 },
                stroke: '#ffffff',
                strokeThickness: 2
            }).setOrigin(0.5).setDepth(1001);
            
            this.tweens.add({
                targets: success,
                y: 100,
                alpha: 0,
                duration: 4000,
                onComplete: () => success.destroy()
            });
        }

        // 8. Reset and Refresh
        this.selectedCardIndex = null;
        this.renderCraftingItems();
    }

    closeAllMenus() {
        const menus = [
            { flag: 'inventoryOpen', container: 'inventoryContainer' },
            { flag: 'storeOpen', container: 'storeContainer' },
            { flag: 'packStoreOpen', container: 'packStoreContainer' },
            { flag: 'dragonMenuOpen', container: 'dragonMenuContainer' },
            { flag: 'statusOpen', container: 'statusContainer' },
            { flag: 'selectionOpen', container: 'selectionContainer' },
            { flag: 'craftingMenuOpen', container: 'craftingMenuContainer' },
            { flag: 'buildMenuOpen', container: 'buildMenuContainer' }
        ];

        menus.forEach(menu => {
            this[menu.flag] = false;
            if (this[menu.container]) this[menu.container].setVisible(false);
        });

        this.selectedCardIndex = null;
    }
}
