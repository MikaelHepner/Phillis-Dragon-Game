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
        this.load.image('dragon_water', 'assets/dragon_water.png');
        this.load.image('dragon_stone', 'assets/dragon_stone.png');
        this.load.image('battle_arena', 'assets/battle_arena.png');
        this.load.image('fireball', 'assets/fireball.png');
        this.load.image('pack', 'assets/pack.png');
        this.load.image('armor', 'assets/armor.png');
        this.load.image('fishing_rod', 'assets/fishing_rod.png');
        this.load.image('part_head', 'assets/part_head.png');
        this.load.image('part_wings', 'assets/part_wings.png');
        this.load.image('part_tail', 'assets/part_tail.png');
        this.load.image('part_body', 'assets/part_body.png');
        this.load.image('combo_2', 'assets/combo_2.png');
        this.load.image('combo_3', 'assets/combo_3.png');
        this.load.image('house', 'assets/house.png');
        this.load.image('castle', 'assets/castle_pixel.png');
        this.load.image('wall', 'assets/wall_pixel.png');
    }

    create() {
        this.scene.start('MainScene');
    }
}
