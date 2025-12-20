import Phaser from 'phaser';
import { RAPIER } from './physics';
import { TowerBuilderScene } from './TowerBuilderScene';

// Phaser does not await an async Scene.create(), so Rapier must be initialized
// before the game boots (otherwise update() runs with uninitialized state).
await RAPIER.init();

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.WEBGL,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'app',
    backgroundColor: '#87CEEB',
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: [TowerBuilderScene]
};

new Phaser.Game(config);
