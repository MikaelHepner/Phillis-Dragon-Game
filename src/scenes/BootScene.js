import Phaser from 'phaser';

export default class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    preload() {
        // Load Pixel Art Assets
        // Note: ensure these filenames match what we copied to public/assets/
        this.load.image('grass', 'assets/grass_pixel.png');
        this.load.image('dragon', 'assets/dragon.png');
        this.load.image('tree', 'assets/appletree.png');
        this.load.image('coin', 'assets/coin.png');
        this.load.image('backpack', 'assets/backpack_pixel.png');
        this.load.image('apple', 'assets/apple_pixel.png');
        this.load.image('rock', 'assets/rock_pixel.png');
        this.load.image('cart', 'assets/cart_pixel.png');
        this.load.image('heart', 'assets/heart_pixel.png');
        this.load.image('dragon_fire', 'assets/dragon_fire.png');
        this.load.image('dragon_ice', 'assets/dragon_ice.png');
        this.load.image('dragon_storm', 'assets/dragon_storm.png');
        this.load.image('battle_arena', 'assets/battle_arena.png');
    }

    create() {
        this.scene.start('MainScene');
    }
}
