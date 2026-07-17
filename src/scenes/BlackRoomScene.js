import Phaser from 'phaser';

export default class BlackRoomScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BlackRoomScene' });
    }

    create() {
        // Pure black background
        this.cameras.main.setBackgroundColor('#000000');

        // Subtle ambient particles — floating dust motes
        const particles = this.add.graphics();
        this.dustMotes = [];
        for (let i = 0; i < 40; i++) {
            this.dustMotes.push({
                x: Phaser.Math.Between(0, 800),
                y: Phaser.Math.Between(0, 600),
                alpha: Math.random() * 0.3 + 0.05,
                size: Math.random() * 2 + 0.5,
                speedX: (Math.random() - 0.5) * 0.3,
                speedY: (Math.random() - 0.5) * 0.2
            });
        }
        this.dustGraphics = particles;

        // Soft vignette overlay
        const vignette = this.add.graphics();
        const vignetteRadius = 350;
        for (let i = 20; i >= 0; i--) {
            const alpha = (1 - i / 20) * 0.4;
            vignette.fillStyle(0x000000, alpha);
            vignette.fillRect(0, 0, 800, 600);
        }

        // Center glow — a very faint light circle
        const glow = this.add.graphics();
        glow.fillStyle(0x222233, 0.15);
        glow.fillCircle(400, 300, 200);
        glow.fillStyle(0x1a1a2e, 0.1);
        glow.fillCircle(400, 300, 300);

        // Room text — fades in
        const roomText = this.add.text(400, 280, '...', {
            fontSize: '28px',
            fontFamily: '"Courier New", Courier, monospace',
            fill: '#555555'
        }).setOrigin(0.5).setAlpha(0);

        this.tweens.add({
            targets: roomText,
            alpha: 1,
            duration: 2000,
            ease: 'Sine.easeIn'
        });

        // Back button — subtle, bottom-center
        const backBtn = this.add.text(400, 540, '← Go Back', {
            fontSize: '18px',
            fontFamily: '"Courier New", Courier, monospace',
            fill: '#444444',
            padding: { x: 16, y: 8 }
        }).setOrigin(0.5).setAlpha(0).setInteractive({ useHandCursor: true });

        // Fade in the back button after a delay
        this.tweens.add({
            targets: backBtn,
            alpha: 1,
            duration: 1500,
            delay: 1500,
            ease: 'Sine.easeIn'
        });

        backBtn.on('pointerover', () => {
            backBtn.setStyle({ fill: '#888888' });
        });
        backBtn.on('pointerout', () => {
            backBtn.setStyle({ fill: '#444444' });
        });
        backBtn.on('pointerdown', () => {
            this.cameras.main.fadeOut(400, 0, 0, 0);
            this.time.delayedCall(400, () => {
                this.scene.stop('BlackRoomScene');
                this.scene.wake('MainScene');
                this.scene.wake('UIScene');
            });
        });
    }

    update() {
        // Animate floating dust motes
        if (this.dustGraphics && this.dustMotes) {
            this.dustGraphics.clear();
            this.dustMotes.forEach(mote => {
                mote.x += mote.speedX;
                mote.y += mote.speedY;

                // Wrap around
                if (mote.x < 0) mote.x = 800;
                if (mote.x > 800) mote.x = 0;
                if (mote.y < 0) mote.y = 600;
                if (mote.y > 600) mote.y = 0;

                this.dustGraphics.fillStyle(0xffffff, mote.alpha);
                this.dustGraphics.fillCircle(mote.x, mote.y, mote.size);
            });
        }
    }
}
