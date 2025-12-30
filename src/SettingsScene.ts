import Phaser from 'phaser';
import type { ProblemType, YearLevel } from 'maths-game-problem-generator';
import { applyHiDpi } from './hiDpi';
import { gameSettings, updateGameSettings } from './gameSettings';
import { resetGameState } from './gameState';
import { LEVELS } from './levels';

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
    private selectedLevel = 0;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private enterKey!: Phaser.Input.Keyboard.Key;
    private titleText!: Phaser.GameObjects.Text;
    private yearText!: Phaser.GameObjects.Text;
    private typeText!: Phaser.GameObjects.Text;
    private levelText!: Phaser.GameObjects.Text;
    private hintText!: Phaser.GameObjects.Text;
    private levelButtons: Phaser.GameObjects.Text[] = [];
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
        this.selectedLevel = 0;

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

        this.levelText = this.add.text(0, 0, 'Select Level:', {
            fontSize: '28px',
            color: '#ffffff',
            backgroundColor: '#00000099',
            padding: { x: 12, y: 8 }
        });

        // Create clickable level buttons
        this.levelButtons = [];
        for (let i = 0; i < LEVELS.length; i++) {
            const btn = this.add.text(0, 0, `${i + 1}`, {
                fontSize: '24px',
                color: '#ffffff',
                backgroundColor: i === this.selectedLevel ? '#4CAF50cc' : '#00000099',
                padding: { x: 12, y: 8 }
            });
            btn.setInteractive({ useHandCursor: true });
            btn.on('pointerdown', () => this.selectLevel(i));
            btn.on('pointerover', () => {
                if (i !== this.selectedLevel) {
                    btn.setBackgroundColor('#666666cc');
                }
            });
            btn.on('pointerout', () => {
                btn.setBackgroundColor(i === this.selectedLevel ? '#4CAF50cc' : '#00000099');
            });
            this.levelButtons.push(btn);
        }

        this.hintText = this.add.text(0, 0, 'Left/Right: difficulty  Up/Down: type  Click level to select  Enter: start', {
            fontSize: '18px',
            color: '#f5f5f5',
            backgroundColor: '#00000066',
            padding: { x: 10, y: 6 }
        });

        this.applyLayout();
        this.updateText();
    }

    private selectLevel(index: number) {
        this.selectedLevel = index;
        this.updateLevelButtons();
    }

    private updateLevelButtons() {
        for (let i = 0; i < this.levelButtons.length; i++) {
            this.levelButtons[i].setBackgroundColor(
                i === this.selectedLevel ? '#4CAF50cc' : '#00000099'
            );
        }
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
        this.scene.start('MainScene', { levelIndex: this.selectedLevel });
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
        const topY = viewHeight / 2 - 220;

        this.titleText.setOrigin(0.5, 0).setPosition(centerX, topY);
        this.yearText.setOrigin(0.5, 0).setPosition(centerX, topY + 100);
        this.typeText.setOrigin(0.5, 0).setPosition(centerX, topY + 160);
        this.levelText.setOrigin(0.5, 0).setPosition(centerX, topY + 230);

        // Position level buttons in a row
        const buttonSpacing = 45;
        const totalWidth = (this.levelButtons.length - 1) * buttonSpacing;
        const startX = centerX - totalWidth / 2;
        const buttonY = topY + 290;

        for (let i = 0; i < this.levelButtons.length; i++) {
            this.levelButtons[i].setOrigin(0.5, 0).setPosition(startX + i * buttonSpacing, buttonY);
        }

        this.hintText.setOrigin(0.5, 0).setPosition(centerX, topY + 360);
    }
}
