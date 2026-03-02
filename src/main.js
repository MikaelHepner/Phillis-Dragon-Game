import Phaser from 'phaser';
import BootScene from './scenes/BootScene';
import MainScene from './scenes/MainScene';
import UIScene from './scenes/UIScene';

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'app',
    backgroundColor: '#5c9634', // Match the grass green
    pixelArt: false, // Disable for smoother rendering of high-res backgrounds
    antialias: true,
    roundPixels: true,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: [BootScene, MainScene, UIScene]
};

const game = new Phaser.Game(config);
