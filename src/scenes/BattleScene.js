import Phaser from 'phaser';

export default class BattleScene extends Phaser.Scene {
    constructor() {
        super('BattleScene');
    }

    init(data) {
        // Data passed from selection
        this.chosenDragonKey = data.dragonKey || 'dragon_fire';
        this.chosenDragonName = data.dragonName || 'Fire Dragon';
    }

    create() {
        // 1. Add Arena Background
        // The image is likely 1024x1024, our game is 800x600
        const arena = this.add.image(400, 300, 'battle_arena');
        
        // Scale to cover the screen
        const scale = Math.max(800 / arena.width, 600 / arena.height);
        arena.setScale(scale);

        // 2. Add Chosen Dragon
        // Position it on the circular platform
        this.dragon = this.add.sprite(400, 350, this.chosenDragonKey);
        this.dragon.setScale(0.25); // Larger than in MainScene for detail

        // Add a simple idle animation/tween
        this.tweens.add({
            targets: this.dragon,
            y: 340,
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

        this.add.text(400, 100, this.chosenDragonName, {
            fontSize: '24px',
            fontFamily: '"Courier New", Courier, monospace',
            fill: '#ffcc00',
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

        // 4. Effects (Particles)
        this.createParticles();
    }

    createParticles() {
        const particles = this.add.particles(0, 0, 'heart', {
            x: { min: 0, max: 800 },
            y: { min: 0, max: 600 },
            scale: { start: 0.05, end: 0 },
            alpha: { start: 0.5, end: 0 },
            speed: { min: 10, max: 30 },
            lifespan: 2000,
            frequency: 100,
            blendMode: 'ADD'
        });
        
        // Change color based on dragon
        if (this.chosenDragonKey === 'dragon_fire') {
            particles.setParticleTint(0xff6600);
        } else if (this.chosenDragonKey === 'dragon_ice') {
            particles.setParticleTint(0x00ffff);
        } else if (this.chosenDragonKey === 'dragon_storm') {
            particles.setParticleTint(0xffff00);
        }
    }
}
