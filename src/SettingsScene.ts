import Phaser from 'phaser';
import type { ProblemType, YearLevel } from 'maths-game-problem-generator';
import { applyHiDpi } from './hiDpi';
import { gameSettings, updateGameSettings } from './gameSettings';
import { resetGameState } from './gameState';

const YEAR_LEVELS: YearLevel[] = [
    'reception',
    'year1',
    'year2',
    'year3',
    'year4',
    'year5',
    'year6'
];

const PROBLEM_TYPES: Array<ProblemType | 'random'> = [
    'random',
    'addition',
    'subtraction',
    'multiplication',
    'division'
];

export class SettingsScene extends Phaser.Scene {
    private dpr = 1;
    private yearIndex = 0;
    private typeIndex = 0;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private enterKey!: Phaser.Input.Keyboard.Key;
    private titleText!: Phaser.GameObjects.Text;
    private yearText!: Phaser.GameObjects.Text;
    private typeText!: Phaser.GameObjects.Text;
    private hintText!: Phaser.GameObjects.Text;
    private handleResize = () => {
        this.dpr = applyHiDpi(this.scale).dpr;
        this.applyLayout();
    };

    constructor() {
        super('SettingsScene');
    }

    create() {
        this.dpr = applyHiDpi(this.scale).dpr;
        window.addEventListener('resize', this.handleResize);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            window.removeEventListener('resize', this.handleResize);
        });

        this.yearIndex = Math.max(0, YEAR_LEVELS.indexOf(gameSettings.yearLevel));
        const currentType = gameSettings.problemType ?? 'random';
        this.typeIndex = Math.max(0, PROBLEM_TYPES.indexOf(currentType));

        this.cursors = this.input.keyboard!.createCursorKeys();
        this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);

        this.titleText = this.add.text(0, 0, 'Beavers vs Towers vs Maths', {
            fontSize: '48px',
            color: '#ffffff',
            backgroundColor: '#000000aa',
            padding: { x: 14, y: 10 }
        });

        this.yearText = this.add.text(0, 0, '', {
            fontSize: '32px',
            color: '#ffffff',
            backgroundColor: '#00000099',
            padding: { x: 12, y: 8 }
        });

        this.typeText = this.add.text(0, 0, '', {
            fontSize: '32px',
            color: '#ffffff',
            backgroundColor: '#00000099',
            padding: { x: 12, y: 8 }
        });

        this.hintText = this.add.text(0, 0, 'Left/Right: difficulty  Up/Down: type  Enter: start', {
            fontSize: '22px',
            color: '#f5f5f5',
            backgroundColor: '#00000066',
            padding: { x: 10, y: 6 }
        });

        this.applyLayout();
        this.updateText();
    }

    update() {
        if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) {
            this.yearIndex = (this.yearIndex - 1 + YEAR_LEVELS.length) % YEAR_LEVELS.length;
            this.updateText();
        }

        if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
            this.yearIndex = (this.yearIndex + 1) % YEAR_LEVELS.length;
            this.updateText();
        }

        if (Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
            this.typeIndex = (this.typeIndex - 1 + PROBLEM_TYPES.length) % PROBLEM_TYPES.length;
            this.updateText();
        }

        if (Phaser.Input.Keyboard.JustDown(this.cursors.down)) {
            this.typeIndex = (this.typeIndex + 1) % PROBLEM_TYPES.length;
            this.updateText();
        }

        if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
            this.startGame();
        }
    }

    private startGame() {
        const yearLevel = YEAR_LEVELS[this.yearIndex];
        const typeOption = PROBLEM_TYPES[this.typeIndex];

        updateGameSettings({
            yearLevel,
            problemType: typeOption === 'random' ? undefined : typeOption
        });

        resetGameState();
        this.scene.start('MainScene', { levelIndex: 0 });
    }

    private updateText() {
        const yearLabel = YEAR_LEVELS[this.yearIndex].replace('year', 'Year ');
        const typeLabel = PROBLEM_TYPES[this.typeIndex];
        this.yearText.setText(`Difficulty: ${yearLabel}`);
        this.typeText.setText(`Problem Type: ${typeLabel}`);
    }

    private applyLayout() {
        const camera = this.cameras.main;
        const viewWidth = camera.width / this.dpr;
        const viewHeight = camera.height / this.dpr;
        const centerX = viewWidth / 2;
        const topY = viewHeight / 2 - 180;

        this.titleText.setOrigin(0.5, 0).setPosition(centerX, topY);
        this.yearText.setOrigin(0.5, 0).setPosition(centerX, topY + 120);
        this.typeText.setOrigin(0.5, 0).setPosition(centerX, topY + 190);
        this.hintText.setOrigin(0.5, 0).setPosition(centerX, topY + 270);
    }
}
