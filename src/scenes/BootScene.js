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
    }

    create() {
        this.scene.launch('UIScene');
        this.scene.start('MainScene');
    }
}
