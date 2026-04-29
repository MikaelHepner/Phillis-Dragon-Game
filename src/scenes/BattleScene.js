import Phaser from 'phaser';

export default class BattleScene extends Phaser.Scene {
    constructor() {
        super('BattleScene');
    }

    init(data) {
        // Data passed from selection
        this.opponentKey = data.opponentKey || 'dragon_fire';
        this.opponentName = data.opponentName || 'Fire Dragon';
        this.playerKey = data.playerKey || 'dragon_ice';
        this.playerName = data.playerName || 'Player Dragon';
    }

    create() {
        // 1. Add Arena Background
        // The image is likely 1024x1024, our game is 800x600
        const arena = this.add.image(400, 300, 'battle_arena');
        
        // Scale to cover the screen
        const scale = Math.max(800 / arena.width, 600 / arena.height);
        arena.setScale(scale);

        // 2. Add Dragons
        
        // Player Dragon (Left)
        this.playerDragon = this.add.sprite(200, 400, this.playerKey);
        this.playerDragon.setScale(0.25); // Equal size for fair fight
        this.playerDragon.setFlipX(true); // Face right

        // Chosen Opponent Dragon (Right)
        this.opponentDragon = this.add.sprite(600, 400, this.opponentKey);
        this.opponentDragon.setScale(0.25); 

        // Add idle animations/tweens for both
        this.tweens.add({
            targets: [this.playerDragon, this.opponentDragon],
            y: '-=10',
            duration: 1500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // 3. UI Elements
        this.add.text(400, 50, 'BATTLE ARENA', {
            fontSize: '48px',
            fontFamily: '"Courier New", Courier, monospace',
            fill: '#ffffff',
            stroke: '#000000',
            strokeThickness: 6,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.vsText = this.add.text(400, 150, 'VS', {
            fontSize: '64px',
            fontFamily: '"Courier New", Courier, monospace',
            fill: '#ff0000',
            stroke: '#000000',
            strokeThickness: 8,
            fontStyle: 'italic'
        }).setOrigin(0.5);

        this.add.text(200, 320, 'YOUR DRAGON', {
            fontSize: '20px',
            fill: '#00ff00',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);

        this.add.text(600, 320, this.opponentName, {
            fontSize: '20px',
            fill: '#ff3333',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);

        // Back Button
        const backBtn = this.add.text(50, 550, '< Return to Island', {
            fontSize: '20px',
            fontFamily: '"Courier New", Courier, monospace',
            fill: '#ffffff',
            backgroundColor: '#000000',
            padding: { x: 10, y: 5 }
        }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });

        backBtn.on('pointerover', () => backBtn.setStyle({ fill: '#ffff00' }));
        backBtn.on('pointerout', () => backBtn.setStyle({ fill: '#ffffff' }));
        
        backBtn.on('pointerdown', () => {
            this.scene.stop('BattleScene');
            this.scene.resume('MainScene');
            this.scene.resume('UIScene');
        });
    }
}
