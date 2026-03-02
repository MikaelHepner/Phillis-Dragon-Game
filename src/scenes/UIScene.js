import Phaser from 'phaser';

export default class UIScene extends Phaser.Scene {
    constructor() {
        super({ key: 'UIScene', active: true });
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
}
