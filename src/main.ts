import Phaser from 'phaser';
import { checkAnswer, generateProblem, type MathProblem } from 'maths-game-problem-generator';
import { RAPIER } from './physics';
import type { RapierPhysics, RapierBody } from './physics';
import { TOWER_LIBRARY } from './towers';
import type { Trackable, TowerInstance, TowerSpawnContext, TowerDefinition } from './towers';
import { GRAVITY_Y, createConfiguredRapier } from './physicsSettings';
import { applyHiDpi } from './hiDpi';
import {
    AIM_ANGLE_MAX_DEG,
    AIM_ANGLE_MIN_DEG,
    AIM_POWER_MIN,
    BALL_RESET_DELAY_MS,
    CATAPULT_HEIGHT_ABOVE_FLOOR,
    BEAVER_RADIUS,
    BEAVER_DENSITY_LEVELS,
    DEBUG_BOUNDS,
    DEBUG_RAPIER,
    PARALLAX_FACTOR,
    PARALLAX_PADDING_FRACTION,
    PERFECT_SHOT_ANGLE_DEG,
    PLATFORM_HEIGHT,
    PLATFORM_PARABOLA_Y_OFFSET,
    PLATFORM_WIDTH,
    TOWER_BALL_FLOOR_MARGIN,
    ANSWER_TEXT_OFFSET_Y
} from './config';
import logUrl from './assets/images/tower_objects/log.png?as=url';
import logFrozenUrl from './assets/images/tower_objects/log_frozen.png?as=url';
// Bypass imagetools processing for background - use original resolution PNG
import backgroundUrl from './assets/images/backgrounds/background.png?url';
import { preloadTowerBallTextures, setBallMood, type TowerBall } from './towerBalls';
import { SettingsScene } from './SettingsScene';
import { gameSettings } from './gameSettings';
import { gameState, type BeaverUpgradeState } from './gameState';
import { LEVELS, type LevelConfig } from './levels';

const toShootModules = import.meta.glob('./assets/images/balls/to_shoot/**/*.png', {
    eager: true,
    query: '?as=url',
    import: 'default'
}) as Record<string, string>;

const beaverUrl =
    Object.entries(toShootModules).find(([path]) => path.includes('/beaver/'))?.[1] ??
    Object.values(toShootModules)[0];

if (!beaverUrl) {
    throw new Error('No to_shoot beaver asset found in src/assets/images/balls/to_shoot');
}

// Phaser does not await an async Scene.create(), so Rapier must be initialized
// before the game boots (otherwise update() runs with uninitialized state).
await RAPIER.init();

// --- CONFIGURATION ---
const FLOOR_Y = 800;
const UNIVERSE_WIDTH = 200_000;
const BALL_STOP_SPEED = 0.01;
const SIM_STOP_ANGULAR_SPEED = 0.00001;
const CRASH_SOUND_COOLDOWN_MS = 180;
const CRASH_SOUND_MIN_RELATIVE_SPEED = 60;
const OW_SOUND_COOLDOWN_MS = 500;
const OW_SOUND_MIN_RELATIVE_SPEED = 80;
const BALL_HIT_MIN_RELATIVE_SPEED = 40;
const TOWER_BALL_AIR_DAMPING = 0.5;
const TOWER_BALL_AIR_ANGULAR_DAMPING = 0.5;
const HUD_PANEL_GAP = 12;
const HUD_MARGIN_X = 20;
const HUD_MARGIN_Y = 20;
const BALL_STATUS_ICON_SIZE = 90;
const BALL_STATUS_ICON_GAP = 8;
const BALL_STATUS_OUTLINE_COLOR = 0x2ecc40;
const BALL_STATUS_OUTLINE_WIDTH = 3;
const UPGRADE_LINE_GAP = 10;
const CATAPULT_PANEL_OFFSET_X = -210;
const CATAPULT_PANEL_OFFSET_Y = 80;
const ANSWER_PANEL_GAP = 16;
const ANSWER_BOX_WIDTH = 360;
const ANSWER_BOX_HEIGHT = 54;
const PANEL_TEXT_COLOR = '#1b1b1b';
const PANEL_BG_COLOR = '#ffffffcc';
const PANEL_BG_HEX = 0xffffff;
const PANEL_BG_ALPHA = 0.8;
const PANEL_BORDER_HEX = 0x2f2f2f;
const PANEL_PADDING = { x: 10, y: 6 };

type TowerTarget = {
    tower: TowerInstance;
    questionText?: Phaser.GameObjects.Text;
    problem: MathProblem;
    state: TowerState;
    platformSurfaceY: number;
};

type TowerState = 'frozen' | 'unfrozen' | 'dynamic';
type UpgradeCategory = 'density';

class MainScene extends Phaser.Scene {
    private rapier!: RapierPhysics;

    // Parallax Background
    private backgroundImage?: Phaser.GameObjects.Image;
    private levelBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    private parallaxCenter = { x: 0, y: 0 };
    private backgroundScale = 1;

    // Game Objects
    private ball!: Phaser.GameObjects.Container;
    private ballBody!: RapierBody;
    private beaverSprite?: Phaser.GameObjects.Image;
    private beaverRing?: Phaser.GameObjects.Arc;
    private towerTargets: TowerTarget[] = [];
    private floorBody!: RapierBody;
    private platforms: Phaser.GameObjects.Rectangle[] = [];

    private trackedObjects: { obj: Trackable; includeInBounds: boolean }[] = [];
    private catapultAnchor = { x: 0, y: 0 };

    private trackObject = (obj: Trackable, includeInBounds = true) => {
        this.trackedObjects.push({ obj, includeInBounds });
    };

    // Controls & State
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private resetKey!: Phaser.Input.Keyboard.Key;
    private aimAngle: number = PERFECT_SHOT_ANGLE_DEG;
    private aimPower: number = 750; // Will be set from levelConfig.perfectShotPower
    private maxAimPower: number = 1500; // Will be 2x perfectShotPower
    private hasLaunched = false;
    private cameraSmoothing = 0.06; // Smoothing per 60fps frame (Phaser style)
    private score = 0;
    private scoredBodies = new Set<number>();
    private answerInputValue = '';
    private catapultProblem?: MathProblem;
    private upgradeState: BeaverUpgradeState = { densityLevel: 0 };
    private upgradeProblems: Record<UpgradeCategory, MathProblem | null> = {
        density: null
    };
    private simStoppedAtMs: number | null = null;
    private launchTimeMs: number | null = null;
    private dpr = 1;
    private currentBeaverRadius = BEAVER_RADIUS;
    private currentBeaverDensity = BEAVER_DENSITY_LEVELS[0];
    private levelIndex = 0;
    private levelConfig!: LevelConfig;
    private activeTowerDefs: TowerDefinition[] = [];
    private levelComplete = false;
    private towerBallTotal = 0;
    private towerBallDown = 0;

    // UI
    private uiCamera!: Phaser.Cameras.Scene2D.Camera;
    private aimGraphics!: Phaser.GameObjects.Graphics;
    private scoreText!: Phaser.GameObjects.Text;
    private feedbackText!: Phaser.GameObjects.Text;
    private catapultQuestionText!: Phaser.GameObjects.Text;
    private upgradeTitleText!: Phaser.GameObjects.Text;
    private upgradeQuestionTexts!: Record<UpgradeCategory, Phaser.GameObjects.Text>;
    private winText!: Phaser.GameObjects.Text;
    private answerBox!: Phaser.GameObjects.Rectangle;
    private answerText!: Phaser.GameObjects.Text;
    private answerHintText!: Phaser.GameObjects.Text;
    private cheatButton!: Phaser.GameObjects.Text;
    private debugGraphics?: Phaser.GameObjects.Graphics;
    private physicsDebugGraphics?: Phaser.GameObjects.Graphics;
    private uiObjects: Phaser.GameObjects.GameObject[] = [];
    private ballStatusIcons: Array<{
        ball: TowerBall;
        icon: Phaser.GameObjects.Image;
        outline: Phaser.GameObjects.Graphics;
    }> = [];
    private splashSoundKeys = ['splash1', 'splash2', 'splash3', 'splash4'];
    private crashSoundKeys = ['crash1', 'crash2', 'crash3', 'crash4'];
    private lastCrashSoundAtMs = 0;
    private lastOwSoundAtMs = 0;
    private handleResize = () => {
        this.dpr = applyHiDpi(this.scale).dpr;
        if (this.uiCamera) {
            this.uiCamera.setViewport(0, 0, this.scale.width, this.scale.height);
        }
        this.updateHudLayout();
    };

    init(data: { levelIndex?: number } = {}) {
        // Reset core state on every restart (Scene is reused)
        this.levelIndex = data.levelIndex ?? gameState.levelIndex ?? 0;
        gameState.levelIndex = this.levelIndex;
        this.levelConfig = LEVELS[this.levelIndex] ?? LEVELS[LEVELS.length - 1];
        this.upgradeState = { ...gameState.upgrades };
        this.refreshBeaverStats();

        this.hasLaunched = false;
        this.aimAngle = PERFECT_SHOT_ANGLE_DEG;
        this.aimPower = this.levelConfig.perfectShotPower;
        this.maxAimPower = this.levelConfig.perfectShotPower * 2;
        this.score = 0;
        this.scoredBodies.clear();
        this.answerInputValue = '';
        this.catapultProblem = undefined;
        this.upgradeProblems = { density: null };
        this.simStoppedAtMs = null;
        this.launchTimeMs = null;
        this.levelComplete = false;
        this.towerBallTotal = 0;
        this.towerBallDown = 0;
        this.activeTowerDefs = [];
        this.ballStatusIcons.forEach(({ icon, outline }) => {
            icon.destroy();
            outline.destroy();
        });
        this.ballStatusIcons = [];

        this.towerTargets.length = 0;
        this.trackedObjects.length = 0;
        this.platforms.length = 0;
    }

    constructor() {
        super('MainScene');
    }

    preload() {
        // Generate a floor texture
        const g = this.make.graphics({ x: 0, y: 0, add: false } as any);
        g.fillStyle(0x4a3c31); // Dark earth
        g.fillRect(0, 0, 64, 64);
        g.fillStyle(0x658d3d); // Grass top
        g.fillRect(0, 0, 64, 10);
        g.generateTexture('ground_tile', 64, 64);
        g.destroy();

        // Sprites
        this.load.image('log1', logUrl);
        this.load.image('log_frozen', logFrozenUrl);
        this.load.image('beaver', beaverUrl);
        this.load.image('background', backgroundUrl);
        preloadTowerBallTextures(this);
        this.load.audio('splash1', new URL('./assets/sound_effects/splashing_sounds/1.mp3', import.meta.url).toString());
        this.load.audio('splash2', new URL('./assets/sound_effects/splashing_sounds/2.mp3', import.meta.url).toString());
        this.load.audio('splash3', new URL('./assets/sound_effects/splashing_sounds/3.mp3', import.meta.url).toString());
        this.load.audio('splash4', new URL('./assets/sound_effects/splashing_sounds/4.mp3', import.meta.url).toString());
        this.load.audio('crash1', new URL('./assets/sound_effects/crashing_sounds/1.mp3', import.meta.url).toString());
        this.load.audio('crash2', new URL('./assets/sound_effects/crashing_sounds/2.mp3', import.meta.url).toString());
        this.load.audio('crash3', new URL('./assets/sound_effects/crashing_sounds/3.mp3', import.meta.url).toString());
        this.load.audio('crash4', new URL('./assets/sound_effects/crashing_sounds/4.mp3', import.meta.url).toString());
        this.load.audio('ow', new URL('./assets/sound_effects/balls/dad/ow.mp3', import.meta.url).toString());
    }

    create() {
        this.dpr = applyHiDpi(this.scale).dpr;
        window.addEventListener('resize', this.handleResize);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            window.removeEventListener('resize', this.handleResize);
        });

        // 1. Init Physics
        this.rapier = createConfiguredRapier(this, false);

        // 2. Create World
        this.createInfiniteFloor();
        this.createPlayerBall();
        this.applyBeaverStats();

        // 3. Generate Level based on Math
        this.activeTowerDefs = this.getLevelTowerDefinitions();
        this.generateParabolaLevel();

        // 4. Create and position parallax background based on level bounds
        this.createParallaxBackground();

        // 5. Create boundary walls aligned to background edges
        this.createBoundaryWalls();

        // 6. UI Camera (fixed to screen, renders above world)
        this.createUiCamera();

        // 7. UI & Controls
        this.cursors = this.input.keyboard!.createCursorKeys();
        this.resetKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
        this.aimGraphics = this.registerWorldObject(this.add.graphics().setDepth(100));

        this.scoreText = this.registerUiObject(this.add.text(20, 20, '', {
            fontSize: '32px',
            color: PANEL_TEXT_COLOR,
            backgroundColor: PANEL_BG_COLOR,
            padding: PANEL_PADDING
        }).setDepth(1000).setScrollFactor(0));

        this.feedbackText = this.registerUiObject(this.add.text(20, 110, '', {
            fontSize: '29px',
            color: PANEL_TEXT_COLOR,
            backgroundColor: PANEL_BG_COLOR,
            padding: PANEL_PADDING
        }).setDepth(1000).setScrollFactor(0).setVisible(false));

        this.winText = this.add.text(0, 0, 'Level complete!\nPress Enter to proceed', {
            fontSize: '48px',
            color: '#ffffff',
            backgroundColor: '#000000cc',
            padding: { x: 18, y: 14 },
            align: 'center'
        });
        this.registerUiObject(this.winText);
        this.winText.setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(3000).setVisible(false);

        this.catapultQuestionText = this.registerWorldObject(this.add
            .text(
                this.catapultAnchor.x + CATAPULT_PANEL_OFFSET_X,
                this.catapultAnchor.y + CATAPULT_PANEL_OFFSET_Y,
                '',
                {
                    fontSize: '32px',
                    color: PANEL_TEXT_COLOR,
                    backgroundColor: PANEL_BG_COLOR,
                    padding: PANEL_PADDING
                }
            )
            .setOrigin(0, 0)
            .setDepth(900));
        this.catapultQuestionText.setWordWrapWidth(ANSWER_BOX_WIDTH);

        this.createAnswerInput();
        this.createCatapultProblem();
        this.createUpgradeUi();
        this.createUpgradeProblems();
        this.createCheatButton();
        this.setFeedbackText('');
        this.input.keyboard?.on('keydown', this.handleAnswerKey, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.input.keyboard?.off('keydown', this.handleAnswerKey, this);
        });

        if (DEBUG_BOUNDS) {
            this.debugGraphics = this.registerWorldObject(this.add.graphics().setDepth(2000));
        }
        if (DEBUG_RAPIER) {
            this.physicsDebugGraphics = this.registerWorldObject(this.add.graphics().setDepth(2000));
        }

        this.updateTowerBallCounts();
        this.updateUI();
        this.updateHudLayout();
    }

    private createInfiniteFloor() {
        // Visuals
        this.add.tileSprite(0, FLOOR_Y + 50, UNIVERSE_WIDTH, 100, 'ground_tile').setDepth(-1);

        // Physics (must be attached to a Phaser GameObject for the connector)
        const floorRect = this.add
            .rectangle(0, FLOOR_Y + 50, UNIVERSE_WIDTH, 100, 0x000000, 0)
            .setDepth(-2);

        this.floorBody = this.rapier.addRigidBody(floorRect, {
            rigidBodyType: RAPIER.RigidBodyType.Fixed
        });
        this.floorBody.collider.setFriction(2.0);
    }

    private createBoundaryWalls() {
        // Get the background bounds to align walls
        const bgBounds = this.getBackgroundBounds();
        if (!bgBounds) {
            console.warn('No background bounds available for boundary walls');
            return;
        }

        // Add 50% padding around the background for the physics walls
        const wallPadding = 0.5;
        const paddingX = bgBounds.width * wallPadding / 2;
        const paddingY = bgBounds.height * wallPadding / 2;

        const wallThickness = 100;

        const leftX = bgBounds.left - paddingX;
        const rightX = bgBounds.right + paddingX;
        const topY = bgBounds.top - paddingY;
        const bottomY = bgBounds.bottom + paddingY + 500; // Extra below to catch falling objects

        // Left wall
        const leftWall = this.add.rectangle(leftX - wallThickness / 2, (topY + bottomY) / 2, wallThickness, bottomY - topY, 0x000000, 0);
        this.rapier.addRigidBody(leftWall, {
            rigidBodyType: RAPIER.RigidBodyType.Fixed,
            collider: RAPIER.ColliderDesc.cuboid(wallThickness / 2, (bottomY - topY) / 2)
        });

        // Right wall
        const rightWall = this.add.rectangle(rightX + wallThickness / 2, (topY + bottomY) / 2, wallThickness, bottomY - topY, 0x000000, 0);
        this.rapier.addRigidBody(rightWall, {
            rigidBodyType: RAPIER.RigidBodyType.Fixed,
            collider: RAPIER.ColliderDesc.cuboid(wallThickness / 2, (bottomY - topY) / 2)
        });

        // Ceiling
        const ceiling = this.add.rectangle((leftX + rightX) / 2, topY - wallThickness / 2, rightX - leftX + wallThickness * 2, wallThickness, 0x000000, 0);
        this.rapier.addRigidBody(ceiling, {
            rigidBodyType: RAPIER.RigidBodyType.Fixed,
            collider: RAPIER.ColliderDesc.cuboid((rightX - leftX + wallThickness * 2) / 2, wallThickness / 2)
        });
    }

    private createParallaxBackground() {
        // Calculate level bounds from catapult to final platform
        this.calculateLevelBounds();

        // Create background image centered on the level
        this.backgroundImage = this.add
            .image(this.parallaxCenter.x, this.parallaxCenter.y, 'background')
            .setOrigin(0.5, 0.5)
            .setDepth(-100)
            .setAlpha(1);

        // Enable linear filtering for smooth scaling (prevents pixelation)
        this.backgroundImage.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);

        // Scale to cover the padded level area
        this.positionParallaxBackground();
    }

    private createUiCamera() {
        this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
        this.uiCamera.setScroll(0, 0);
        this.uiCamera.setZoom(1);
        this.uiCamera.ignore(this.children.list);
    }

    private registerUiObject<T extends Phaser.GameObjects.GameObject>(obj: T): T {
        this.uiObjects.push(obj);
        this.cameras.main.ignore(obj);
        return obj;
    }

    private registerWorldObject<T extends Phaser.GameObjects.GameObject>(obj: T): T {
        if (this.uiCamera) {
            this.uiCamera.ignore(obj);
        }
        return obj;
    }

    private getTowerBalls() {
        const balls: TowerBall[] = [];
        for (const target of this.towerTargets) {
            const towerBalls = target.tower.ballBodies ?? [];
            balls.push(...towerBalls);
        }
        return balls;
    }

    private syncBallStatusHud() {
        const balls = this.getTowerBalls();
        const sameList =
            balls.length === this.ballStatusIcons.length &&
            balls.every((ball, index) => this.ballStatusIcons[index]?.ball === ball);
        if (!sameList) {
            for (const entry of this.ballStatusIcons) {
                entry.icon.destroy();
                entry.outline.destroy();
            }
            this.ballStatusIcons = balls.map((ball) => {
                const icon = this.registerUiObject(this.add.image(0, 0, ball.sprite.texture.key));
                icon.setDisplaySize(BALL_STATUS_ICON_SIZE, BALL_STATUS_ICON_SIZE).setDepth(1200).setScrollFactor(0);
                const outline = this.registerUiObject(this.add.graphics());
                outline.setDepth(1199).setScrollFactor(0);
                return { ball, icon, outline };
            });
        }
        this.updateBallStatusLayout();
        this.updateBallStatusIcons();
    }

    private updateBallStatusIcons() {
        if (!this.ballStatusIcons.length) return;
        for (const entry of this.ballStatusIcons) {
            const textureKey = entry.ball.sprite.texture.key;
            if (entry.icon.texture.key !== textureKey) {
                entry.icon.setTexture(textureKey);
            }
            entry.icon.setAlpha(1);
            entry.outline.setVisible(entry.ball.isDown);
        }
    }

    private updateBallStatusLayout() {
        if (!this.ballStatusIcons.length) return;
        const viewWidth = this.scale.width;
        const rightEdge = viewWidth - HUD_MARGIN_X;
        const maxPerRow = Math.max(
            1,
            Math.floor((viewWidth - HUD_MARGIN_X * 2 + BALL_STATUS_ICON_GAP) / (BALL_STATUS_ICON_SIZE + BALL_STATUS_ICON_GAP))
        );

        for (let i = 0; i < this.ballStatusIcons.length; i += 1) {
            const col = i % maxPerRow;
            const row = Math.floor(i / maxPerRow);
            const x = rightEdge - BALL_STATUS_ICON_SIZE / 2 - col * (BALL_STATUS_ICON_SIZE + BALL_STATUS_ICON_GAP);
            const y = HUD_MARGIN_Y + BALL_STATUS_ICON_SIZE / 2 + row * (BALL_STATUS_ICON_SIZE + BALL_STATUS_ICON_GAP);
            const entry = this.ballStatusIcons[i];
            entry.icon.setPosition(x, y);
            entry.outline.clear();
            entry.outline.lineStyle(BALL_STATUS_OUTLINE_WIDTH, BALL_STATUS_OUTLINE_COLOR, 1);
            entry.outline.strokeCircle(0, 0, BALL_STATUS_ICON_SIZE / 2 + BALL_STATUS_OUTLINE_WIDTH);
            entry.outline.setPosition(x, y);
        }
    }

    private calculateLevelBounds() {
        const catapultX = this.catapultAnchor.x;
        const catapultY = this.catapultAnchor.y;

        let minX = catapultX;
        let maxX = catapultX;
        let minY = catapultY;
        let maxY = FLOOR_Y;

        // Use platforms to find level bounds
        for (const platform of this.platforms) {
            const bounds = platform.getBounds();
            minX = Math.min(minX, bounds.left);
            maxX = Math.max(maxX, bounds.right);
            minY = Math.min(minY, bounds.top);
            maxY = Math.max(maxY, bounds.bottom);
        }

        // Account for tower heights above platforms
        for (const target of this.towerTargets) {
            minY = Math.min(minY, target.platformSurfaceY - 300);
        }

        this.levelBounds = { minX, maxX, minY, maxY };
        this.parallaxCenter = {
            x: (minX + maxX) / 2,
            y: (minY + maxY) / 2
        };
    }

    private positionParallaxBackground() {
        if (!this.backgroundImage) return;

        // Calculate required coverage area with padding
        const levelWidth = this.levelBounds.maxX - this.levelBounds.minX;
        const levelHeight = this.levelBounds.maxY - this.levelBounds.minY;
        const paddedWidth = levelWidth * (1 + PARALLAX_PADDING_FRACTION);
        const paddedHeight = levelHeight * (1 + PARALLAX_PADDING_FRACTION);

        // Get source image dimensions from texture (not display size)
        const frame = this.backgroundImage.texture.getSourceImage();
        const sourceW = frame.width;
        const sourceH = frame.height;

        // Calculate scale to cover the padded area (maintaining aspect ratio)
        const scaleX = paddedWidth / sourceW;
        const scaleY = paddedHeight / sourceH;
        this.backgroundScale = Math.max(scaleX, scaleY);

        this.backgroundImage.setScale(this.backgroundScale);
        this.backgroundImage.setPosition(this.parallaxCenter.x, this.parallaxCenter.y);
    }

    private updateParallaxBackground(cameraX: number, cameraY: number) {
        if (!this.backgroundImage) return;

        // Calculate offset from the level center
        const offsetX = cameraX - this.parallaxCenter.x;
        const offsetY = cameraY - this.parallaxCenter.y;

        // Apply reduced movement (parallax effect)
        // The background moves in the same direction as the camera but at a reduced rate
        const parallaxX = this.parallaxCenter.x + offsetX * PARALLAX_FACTOR;
        const parallaxY = this.parallaxCenter.y + offsetY * PARALLAX_FACTOR;

        this.backgroundImage.setPosition(parallaxX, parallaxY);
    }

    private getBackgroundBounds() {
        if (!this.backgroundImage) return null;
        // Use texture source dimensions, not the scaled display dimensions
        const frame = this.backgroundImage.texture.getSourceImage();
        const sourceW = frame.width;
        const sourceH = frame.height;
        if (!isFinite(sourceW) || !isFinite(sourceH) || sourceW <= 0 || sourceH <= 0) return null;

        const width = sourceW * this.backgroundScale;
        const height = sourceH * this.backgroundScale;
        const centerX = this.parallaxCenter.x;
        const centerY = this.parallaxCenter.y;

        return {
            width,
            height,
            left: centerX - width / 2,
            right: centerX + width / 2,
            top: centerY - height / 2,
            bottom: centerY + height / 2
        };
    }

    private getMinZoomForBackground() {
        const bounds = this.getBackgroundBounds();
        if (!bounds) return 0.15; // fallback minimum zoom

        const camera = this.cameras.main;
        const viewWidth = camera.width / this.dpr;
        const viewHeight = camera.height / this.dpr;

        // Calculate minimum zoom so the view doesn't exceed the background bounds
        return Math.max(viewWidth / bounds.width, viewHeight / bounds.height);
    }

    private createPlayerBall() {
        const startX = -600;
        const startY = FLOOR_Y - CATAPULT_HEIGHT_ABOVE_FLOOR;
        this.catapultAnchor = { x: startX, y: startY };
        const radius = this.currentBeaverRadius;

        // "Beaver" Visual (Container so we can add a ring)
        const container = this.add.container(startX, startY);
        container.setSize(radius * 2, radius * 2);

        const ring = this.add.circle(0, 0, radius + 4, 0x000000, 0).setStrokeStyle(4, 0xffffff, 1);
        const beaver = this.add.image(0, 0, 'beaver');
        const scale = Math.min((radius * 2) / beaver.width, (radius * 2) / beaver.height);
        beaver.setScale(scale);
        container.add([ring, beaver]);
        this.beaverRing = ring;
        this.beaverSprite = beaver;

        this.ball = container;
        this.trackObject(this.ball as unknown as Trackable, true);

        this.ballBody = this.rapier.addRigidBody(container, {
            rigidBodyType: RAPIER.RigidBodyType.Dynamic,
            collider: RAPIER.ColliderDesc.ball(radius)
        });

        // Float mode until launch
        this.ballBody.rigidBody.setGravityScale(0, true);
        this.ballBody.collider.setRestitution(0.4);
        this.ballBody.collider.setFriction(1.5);
        this.ballBody.collider.setDensity(this.currentBeaverDensity);
    }

    private refreshBeaverStats() {
        const densityIndex = Phaser.Math.Clamp(this.upgradeState.densityLevel, 0, BEAVER_DENSITY_LEVELS.length - 1);

        this.currentBeaverRadius = BEAVER_RADIUS;
        this.currentBeaverDensity = BEAVER_DENSITY_LEVELS[densityIndex];
        // maxAimPower is set from levelConfig in init(), not from upgrades
    }

    private applyBeaverStats() {
        this.refreshBeaverStats();
        if (!this.ballBody || !this.ball) return;

        const radius = this.currentBeaverRadius;
        this.ball.setSize(radius * 2, radius * 2);
        this.ballBody.collider.setRadius(radius);
        this.ballBody.collider.setDensity(this.currentBeaverDensity);

        if (this.beaverRing) this.beaverRing.setRadius(radius + 4);
        if (this.beaverSprite) {
            const scale = Math.min((radius * 2) / this.beaverSprite.width, (radius * 2) / this.beaverSprite.height);
            this.beaverSprite.setScale(scale);
        }

        this.aimPower = Phaser.Math.Clamp(this.aimPower, AIM_POWER_MIN, this.maxAimPower);
    }

    /**
     * The Maths part!
     * We calculate the trajectory of a projectile launched at PERFECT_SHOT_ANGLE_DEG and the level's perfectShotPower.
     * We place platforms along this path.
     */
    private generateParabolaLevel() {
        const startX = this.ball.x;
        const startY = this.ball.y;
        const perfectShotPower = this.levelConfig.perfectShotPower;

        const rads = Phaser.Math.DegToRad(PERFECT_SHOT_ANGLE_DEG);
        const vx = perfectShotPower * Math.cos(rads);
        const vy = perfectShotPower * Math.sin(rads);

        // Place platforms along the "ideal" trajectory, leaving an initial gap fraction.
        // Gap fraction is based on the full trajectory until returning to the launch height (symmetric about the apex).
        const tReturnToStartY = (-2 * vy) / GRAVITY_Y;
        if (!isFinite(tReturnToStartY) || tReturnToStartY <= 0) return;

        // End placement when the *platform top* reaches the origin height:
        // platformTop = parabolaY + PLATFORM_PARABOLA_Y_OFFSET === startY
        // => parabolaY === startY - PLATFORM_PARABOLA_Y_OFFSET
        const a = 0.5 * GRAVITY_Y;
        const b = vy;
        const c = PLATFORM_PARABOLA_Y_OFFSET;
        const disc = b * b - 4 * a * c;
        if (disc <= 0) return;
        const tEnd = (-b + Math.sqrt(disc)) / (2 * a);
        if (!isFinite(tEnd) || tEnd <= 0) return;

        const gap = Phaser.Math.Clamp(this.levelConfig.platformGapFraction, 0, 0.99);
        const tStart = gap * tReturnToStartY;
        const tStartClamped = Math.min(tStart, tEnd);

        for (let i = 0; i < this.levelConfig.platformCount; i++) {
            const alphaWithin = this.levelConfig.platformCount === 1 ? 0.5 : i / (this.levelConfig.platformCount - 1);
            const t = Phaser.Math.Linear(tStartClamped, tEnd, alphaWithin);

            // Kinematic Equation: p = p0 + v*t + 0.5*a*t^2
            const x = startX + vx * t;
            const y = startY + vy * t + 0.5 * GRAVITY_Y * t * t;
            this.createPlatformWithTower(x, y);
        }
    }

    private createPlatformWithTower(x: number, y: number) {
        // Platform placement:
        // - left edge aligns to parabola x
        // - top surface sits PLATFORM_PARABOLA_Y_OFFSET below parabola y
        const platformLeft = x;
        const platW = PLATFORM_WIDTH;
        const platH = PLATFORM_HEIGHT;
        const platformTop = y + PLATFORM_PARABOLA_Y_OFFSET;
        const platform = this.add.rectangle(platformLeft + platW / 2, platformTop + platH / 2, platW, platH, 0x555555); // Dark Grey

        this.rapier.addRigidBody(platform, {
            rigidBodyType: RAPIER.RigidBodyType.Fixed,
            collider: RAPIER.ColliderDesc.cuboid(platW / 2, platH / 2)
        });
        this.trackObject(platform as unknown as Trackable, true);
        this.platforms.push(platform);

        const towerX = platformLeft + platW / 2;
        const surfaceY = platformTop;

        const ctx: TowerSpawnContext = {
            scene: this,
            rapier: this.rapier,
            x: towerX,
            surfaceY,
            trackObject: this.trackObject
        };

        const def = Phaser.Utils.Array.GetRandom(this.activeTowerDefs);
        const instance = def.spawn(ctx);

        instance.setFrozenVisual?.(true);

        const problem = this.generateProblemFromSettings();
        const questionText = this.add.text(towerX, surfaceY + ANSWER_TEXT_OFFSET_Y, `${problem.expression} = ?`, {
            fontSize: '43px',
            color: '#1b1b1b',
            backgroundColor: '#ffffffcc',
            padding: { x: 8, y: 4 }
        }).setOrigin(0.5, 0).setDepth(900);

        this.towerTargets.push({
            tower: instance,
            questionText,
            problem,
            state: 'frozen',
            platformSurfaceY: surfaceY
        });
    }

    private getLevelTowerDefinitions(): TowerDefinition[] {
        const ids = new Set(this.levelConfig.towerIds);
        const defs = TOWER_LIBRARY.filter((def) => ids.has(def.id));
        if (!defs.length) {
            console.warn('No matching tower definitions for level; falling back to full library.');
            return TOWER_LIBRARY;
        }
        return defs;
    }

    private updateTowerBallCounts() {
        let total = 0;
        for (const target of this.towerTargets) {
            total += target.tower.ballBodies?.length ?? 0;
        }
        this.towerBallTotal = total;
        this.towerBallDown = 0;
        this.updateUI();
        this.syncBallStatusHud();
    }

    private createCatapultProblem() {
        const problem = this.generateProblemFromSettings();
        this.catapultProblem = problem;
        this.catapultQuestionText.setText(`${problem.expression} = ?`);
        this.updateAnswerLayout();
    }

    private createUpgradeUi() {
        const baseX = HUD_MARGIN_X;
        const baseY = HUD_MARGIN_Y;

        this.upgradeTitleText = this.registerUiObject(this.add
            .text(baseX, baseY, 'Beaver upgrades', {
                fontSize: '35px',
                color: PANEL_TEXT_COLOR,
                backgroundColor: PANEL_BG_COLOR,
                padding: PANEL_PADDING
            })
            .setOrigin(0, 0)
            .setDepth(900)
            .setScrollFactor(0));
        this.upgradeTitleText.setVisible(true);

        this.upgradeQuestionTexts = {
            density: this.registerUiObject(this.add
                .text(baseX, baseY + 10, '', {
                    fontSize: '29px',
                    color: PANEL_TEXT_COLOR,
                    backgroundColor: PANEL_BG_COLOR,
                    padding: PANEL_PADDING
                })
                .setOrigin(0, 0)
                .setDepth(900)
                .setScrollFactor(0))
        };

        this.updateUpgradeUi();
    }

    private createUpgradeProblems() {
        const usedAnswers = new Set<number>();
        const categories: UpgradeCategory[] = ['density'];

        for (const category of categories) {
            if (!this.canUpgrade(category)) {
                this.upgradeProblems[category] = null;
                continue;
            }
            const problem = this.generateUniqueProblem(usedAnswers);
            this.upgradeProblems[category] = problem;
            usedAnswers.add(problem.answer);
        }

        this.updateUpgradeUi();
    }

    private createCheatButton() {
        // Create a small cheat button in the top right corner (scrollFactor 0 to stay fixed on screen)
        this.cheatButton = this.registerUiObject(this.add
            .text(10, 10, '🔓 Unfreeze All', {
                fontSize: '21px',
                color: '#ffffff',
                backgroundColor: '#ff6b6bcc',
                padding: { x: 8, y: 4 }
            })
            .setScrollFactor(0)
            .setDepth(3000)
            .setInteractive({ useHandCursor: true }));

        this.cheatButton.on('pointerdown', () => {
            this.unfreezeAllTowers();
        });

        this.cheatButton.on('pointerover', () => {
            this.cheatButton.setBackgroundColor('#ff4444cc');
        });

        this.cheatButton.on('pointerout', () => {
            this.cheatButton.setBackgroundColor('#ff6b6bcc');
        });
    }

    private unfreezeAllTowers() {
        let unfrozenCount = 0;
        for (const target of this.towerTargets) {
            if (target.state === 'frozen') {
                target.state = 'unfrozen';
                target.tower.setFrozenVisual?.(false);
                target.questionText?.destroy();
                target.questionText = undefined;
                unfrozenCount += 1;
            }
        }
        if (unfrozenCount > 0) {
            this.setFeedbackText(`Cheat: ${unfrozenCount} tower${unfrozenCount === 1 ? '' : 's'} unfrozen!`);
        } else {
            this.setFeedbackText('No frozen towers to unfreeze.');
        }
    }

    private createAnswerInput() {
        const boxWidth = ANSWER_BOX_WIDTH;
        const boxHeight = ANSWER_BOX_HEIGHT;
        const panelLeft = this.catapultAnchor.x + CATAPULT_PANEL_OFFSET_X;
        const panelCenterX = panelLeft + ANSWER_BOX_WIDTH / 2;
        const y = this.catapultAnchor.y + CATAPULT_PANEL_OFFSET_Y;

        this.answerBox = this.registerWorldObject(this.add
            .rectangle(panelCenterX, y, boxWidth, boxHeight, PANEL_BG_HEX, PANEL_BG_ALPHA)
            .setStrokeStyle(3, PANEL_BORDER_HEX, 1)
            .setDepth(1000));

        this.answerText = this.registerWorldObject(this.add
            .text(panelCenterX, y, '', { fontSize: '35px', color: PANEL_TEXT_COLOR })
            .setOrigin(0.5, 0.5)
            .setDepth(1001));

        this.answerHintText = this.registerWorldObject(this.add
            .text(panelLeft, y + boxHeight / 2 + 6, 'Type answer + Enter', {
                fontSize: '27px',
                color: PANEL_TEXT_COLOR,
                backgroundColor: PANEL_BG_COLOR,
                padding: PANEL_PADDING
            })
            .setOrigin(0, 0.5)
            .setDepth(1001));

        this.updateAnswerLayout();
        this.updateAnswerText();
    }

    private updateAnswerLayout() {
        if (!this.answerBox || !this.answerText || !this.answerHintText || !this.catapultQuestionText) return;
        const uiScale = this.getUiScale();
        const panelLeft = this.catapultAnchor.x + CATAPULT_PANEL_OFFSET_X * uiScale;
        const panelY = this.catapultAnchor.y + CATAPULT_PANEL_OFFSET_Y * uiScale;
        const boxWidth = ANSWER_BOX_WIDTH * uiScale;
        const boxHeight = ANSWER_BOX_HEIGHT * uiScale;
        const panelCenterX = panelLeft + boxWidth / 2;

        this.catapultQuestionText.setOrigin(0, 0).setPosition(panelLeft, panelY);

        const questionHeight = this.catapultQuestionText.displayHeight;
        const answerTop = panelY + questionHeight + ANSWER_PANEL_GAP * uiScale;
        const answerCenterY = answerTop + boxHeight / 2;

        this.answerBox.setSize(ANSWER_BOX_WIDTH, ANSWER_BOX_HEIGHT);
        this.answerBox.setPosition(panelCenterX, answerCenterY);
        this.answerText.setPosition(panelCenterX, answerCenterY);
        const hintY = answerCenterY + boxHeight / 2 + 30 * uiScale;
        this.answerHintText.setPosition(panelLeft, hintY);
    }

    private updateUpgradeLayout() {
        if (!this.upgradeTitleText || !this.upgradeQuestionTexts) return;
        const uiScale = 1;
        const baseX = HUD_MARGIN_X;
        const baseY = HUD_MARGIN_Y;
        this.upgradeTitleText.setOrigin(0, 0).setPosition(baseX, baseY);

        const y = baseY + this.upgradeTitleText.displayHeight + UPGRADE_LINE_GAP * uiScale;
        const text = this.upgradeQuestionTexts.density;
        text.setOrigin(0, 0).setPosition(baseX, y);
    }

    private updateHudLayout() {
        if (!this.scoreText || !this.feedbackText) return;
        const uiScale = 1;
        const hudGap = HUD_PANEL_GAP * uiScale;

        this.updateUpgradeLayout();
        this.updateBallStatusLayout();

        let upgradeBottom = HUD_MARGIN_Y;
        const upgradeVisible =
            (this.upgradeTitleText?.visible ?? false) || (this.upgradeQuestionTexts?.density.visible ?? false);
        if (this.upgradeTitleText?.visible) {
            upgradeBottom = this.upgradeTitleText.y + this.upgradeTitleText.displayHeight;
        }
        if (this.upgradeQuestionTexts?.density.visible) {
            upgradeBottom = this.upgradeQuestionTexts.density.y + this.upgradeQuestionTexts.density.displayHeight;
        }

        let y = upgradeBottom + (upgradeVisible ? hudGap : 0);
        this.scoreText.setOrigin(0, 0).setPosition(HUD_MARGIN_X, y);
        y += this.scoreText.displayHeight + hudGap;
        this.feedbackText.setOrigin(0, 0).setPosition(HUD_MARGIN_X, y);

        this.updateAnswerLayout();
        this.updateWinLayout();
    }

    private updateWinLayout() {
        if (!this.winText) return;
        const viewWidth = this.scale.width;
        const viewHeight = this.scale.height;
        this.winText.setPosition(viewWidth / 2, viewHeight / 2);
    }

    private updateAnswerText() {
        this.answerText.setText(this.answerInputValue);
        const hasInput = this.answerInputValue.length > 0;
        this.answerHintText.setVisible(!hasInput);
        this.answerBox.setStrokeStyle(3, hasInput ? PANEL_BORDER_HEX : 0x555555, 1);
    }

    private setFeedbackText(message: string) {
        this.feedbackText.setText(message);
        this.feedbackText.setVisible(message.length > 0);
    }

    private getUiScale() {
        const zoom = this.cameras.main.zoom || 1;
        return zoom > 0 ? 1 / zoom : 1;
    }

    private applyUiScale() {
        const uiScale = this.getUiScale();
        const applyScale = (obj?: Phaser.GameObjects.Components.Transform) => {
            if (!obj) return;
            obj.setScale(uiScale);
        };

        applyScale(this.catapultQuestionText);
        applyScale(this.answerBox);
        applyScale(this.answerText);
        applyScale(this.answerHintText);

        for (const target of this.towerTargets) {
            if (!target.questionText) continue;
            target.questionText.setScale(uiScale);
            target.questionText.setPosition(
                target.questionText.x,
                target.platformSurfaceY + ANSWER_TEXT_OFFSET_Y * uiScale
            );
        }
    }

    private updateUpgradeUi() {
        if (!this.upgradeQuestionTexts) return;
        const categories: UpgradeCategory[] = ['density'];
        for (const category of categories) {
            const label = this.getUpgradeLabel(category);
            const problem = this.upgradeProblems[category];
            const text = problem ? `${label}: ${problem.expression} = ?` : `${label}: maxed`;
            this.upgradeQuestionTexts[category].setText(text);
        }
    }

    private getUpgradeLabel(category: UpgradeCategory) {
        const label = category.charAt(0).toUpperCase() + category.slice(1);
        const level = this.upgradeState.densityLevel + 1;
        const max = BEAVER_DENSITY_LEVELS.length;
        return `${label} ${level}/${max}`;
    }

    private canUpgrade(category: UpgradeCategory) {
        return category === 'density' && this.upgradeState.densityLevel < BEAVER_DENSITY_LEVELS.length - 1;
    }

    private applyUpgrade(category: UpgradeCategory) {
        if (!this.canUpgrade(category)) return '';

        if (category === 'density') this.upgradeState.densityLevel += 1;

        gameState.upgrades = { ...this.upgradeState };
        this.applyBeaverStats();
        this.refreshUpgradeProblem(category);
        this.updateUI();

        return this.getUpgradeLabel(category);
    }

    private tryUpgrade(answerValue: number | string) {
        const categories: UpgradeCategory[] = ['density'];
        for (const category of categories) {
            const problem = this.upgradeProblems[category];
            if (!problem) continue;
            if (!checkAnswer(problem, answerValue)) continue;
            return this.applyUpgrade(category);
        }
        return '';
    }

    private generateUniqueProblem(usedAnswers: Set<number>, maxAttempts = 6) {
        let problem = this.generateProblemFromSettings();
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            if (!usedAnswers.has(problem.answer)) return problem;
            problem = this.generateProblemFromSettings();
        }
        return problem;
    }

    private refreshUpgradeProblem(category: UpgradeCategory) {
        if (!this.canUpgrade(category)) {
            this.upgradeProblems[category] = null;
            this.updateUpgradeUi();
            return;
        }

        const usedAnswers = new Set<number>();
        const categories: UpgradeCategory[] = ['density'];
        for (const other of categories) {
            if (other === category) continue;
            const problem = this.upgradeProblems[other];
            if (problem) usedAnswers.add(problem.answer);
        }

        this.upgradeProblems[category] = this.generateUniqueProblem(usedAnswers);
        this.updateUpgradeUi();
    }

    private generateProblemFromSettings() {
        const { yearLevel, problemType } = gameSettings;
        if (problemType) {
            try {
                return generateProblem({ yearLevel, type: problemType });
            } catch (error) {
                console.warn('Problem type not available, falling back to year-only problem.', error);
            }
        }
        return generateProblem({ yearLevel });
    }

    private handleAnswerKey(event: KeyboardEvent) {
        if (this.levelComplete) {
            if (event.key === 'Enter') {
                this.advanceLevel();
            }
            return;
        }

        if (event.key === 'Enter') {
            this.submitAnswer();
            return;
        }

        if (event.key === 'Backspace') {
            this.answerInputValue = this.answerInputValue.slice(0, -1);
            this.updateAnswerText();
            return;
        }

        if (event.key === 'Escape') {
            this.answerInputValue = '';
            this.updateAnswerText();
            return;
        }

        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key.length !== 1) return;

        const isDigit = event.key >= '0' && event.key <= '9';
        if (isDigit) {
            this.answerInputValue += event.key;
            this.updateAnswerText();
            return;
        }

        if (event.key === '.' && !this.answerInputValue.includes('.')) {
            this.answerInputValue += event.key;
            this.updateAnswerText();
            return;
        }

        if (event.key === '-' && this.answerInputValue.length === 0) {
            this.answerInputValue += event.key;
            this.updateAnswerText();
        }
    }

    private submitAnswer() {
        const trimmed = this.answerInputValue.trim();
        if (!trimmed) return;

        const numericValue = Number(trimmed);
        const answerValue = Number.isFinite(numericValue) ? numericValue : trimmed;

        const upgradeLabel = this.tryUpgrade(answerValue);

        let unfrozenCount = 0;
        for (const target of this.towerTargets) {
            if (target.state !== 'frozen') continue;
            if (checkAnswer(target.problem, answerValue)) {
                target.state = 'unfrozen';
                target.tower.setFrozenVisual?.(false);
                target.questionText?.destroy();
                target.questionText = undefined;
                unfrozenCount += 1;
            }
        }

        let launched = false;
        if (!this.hasLaunched && this.catapultProblem && checkAnswer(this.catapultProblem, answerValue)) {
            launched = true;
            this.launch();
        }

        const feedbackParts: string[] = [];
        if (upgradeLabel) feedbackParts.push(`Upgrade: ${upgradeLabel}.`);
        if (unfrozenCount > 0) {
            feedbackParts.push(`${unfrozenCount} tower${unfrozenCount === 1 ? '' : 's'} unfrozen.`);
        }
        if (launched) feedbackParts.push('Launching...');

        if (feedbackParts.length) {
            this.setFeedbackText(feedbackParts.join(' '));
        } else {
            this.setFeedbackText('Not quite. Try again!');
        }

        this.answerInputValue = '';
        this.updateAnswerText();
    }

    // --- GAME LOOP ---

    update(time: number, delta: number) {
        this.handleInput();
        this.updateCamera(delta);
        this.updateHudLayout();
        this.drawAimArrow();
        this.applyRollingResistance();
        this.applyDadBallRollingResistance();
        this.checkTowerActivations();
        this.checkTowerCrashSounds(time);
        this.checkDadBallKnockSound(time);
        this.updateTowerBallEmotions();
        this.checkTowerGroundHits();
        this.checkLevelCompletion();
        this.updateBallStatusIcons();
        this.checkSimulationAutoReset(time);
        this.drawDebugBounds();
        this.drawPhysicsDebug();
    }

    private drawDebugBounds() {
        if (!this.debugGraphics) return;

        this.debugGraphics.clear();
        this.debugGraphics.lineStyle(2, 0xff00ff, 0.9);

        for (const t of this.trackedObjects) {
            if (!t.obj.active) continue;
            const b = t.obj.getBounds();
            this.debugGraphics.strokeRect(b.x, b.y, b.width, b.height);
        }
    }

    private drawPhysicsDebug() {
        if (!this.physicsDebugGraphics) return;
        const graphics = this.physicsDebugGraphics;
        const debug = this.rapier.getWorld().debugRender();
        const vertices = debug.vertices;

        graphics.clear();

        const isIdle = this.simStoppedAtMs !== null && this.hasLaunched;
        const color = isIdle ? 0xff4d4d : 0x39e68a;
        const alpha = isIdle ? 0.9 : 0.75;
        graphics.lineStyle(2, color, alpha);

        for (let i = 0; i < vertices.length; i += 4) {
            graphics.lineBetween(vertices[i], vertices[i + 1], vertices[i + 2], vertices[i + 3]);
        }
    }

    private applyRollingResistance() {
        if (!this.ballBody) return;

        const centerY = this.ballBody.rigidBody.translation().y;
        const distToFloor = FLOOR_Y - centerY;
        const isOnGround = distToFloor <= this.currentBeaverRadius + 5;

        if (isOnGround) {
            this.ballBody.rigidBody.setLinearDamping(1.5);
            this.ballBody.rigidBody.setAngularDamping(1.5);
        } else {
            this.ballBody.rigidBody.setLinearDamping(0);
            this.ballBody.rigidBody.setAngularDamping(0.5);
        }
    }

    private checkTowerActivations() {
        if (!this.ballBody) return;

        const world = this.rapier.getWorld();
        const impactBodies: RapierBody[] = [];

        if (this.hasLaunched) impactBodies.push(this.ballBody);

        for (const target of this.towerTargets) {
            if (target.state === 'dynamic') {
                impactBodies.push(...target.tower.bodies);
            }
        }

        if (!impactBodies.length) return;

        for (const target of this.towerTargets) {
            if (target.state !== 'unfrozen') continue;
            let hit = false;
            for (const impactBody of impactBodies) {
                for (const body of target.tower.bodies) {
                    world.contactPair(impactBody.collider, body.collider, () => {
                        hit = true;
                    });
                    if (hit) break;
                }
                if (hit) break;
            }

            if (hit) {
                target.state = 'dynamic';
                target.tower.enableDynamics?.();
            }
        }
    }

    private checkTowerGroundHits() {
        if (!this.floorBody) return;
        const world = this.rapier.getWorld();

        for (const target of this.towerTargets) {
            for (const body of target.tower.bodies) {
                const handle = body.collider.handle;
                if (this.scoredBodies.has(handle)) continue;

                let hit = false;
                world.contactPair(body.collider, this.floorBody.collider, () => {
                    hit = true;
                });

                if (hit) {
                    this.scoredBodies.add(handle);
                    this.score += 1;
                    this.updateUI();
                    this.playSplashSound();
                }
            }
        }
    }

    private checkLevelCompletion() {
        if (this.levelComplete || !this.floorBody) return;
        let total = 0;
        let down = 0;

        for (const target of this.towerTargets) {
            const balls = target.tower.ballBodies ?? [];
            for (const ball of balls) {
                total += 1;
                if (!ball.isDown && this.isTowerBallDown(target, ball)) {
                    ball.isDown = true;
                }
                if (ball.isDown) down += 1;
            }
        }

        const changed = total !== this.towerBallTotal || down !== this.towerBallDown;
        this.towerBallTotal = total;
        this.towerBallDown = down;
        if (changed) this.updateUI();

        if (total > 0 && down === total) {
            this.completeLevel();
        }
    }

    private isTowerBallDown(target: TowerTarget, ball: TowerBall) {
        const centerY = ball.body.rigidBody.translation().y;
        const distToFloor = FLOOR_Y - centerY;
        const nearFloor = distToFloor <= ball.radius + 2;
        const belowPlatform = centerY >= target.platformSurfaceY + PLATFORM_HEIGHT;

        let hitFloor = false;
        this.rapier.getWorld().contactPair(ball.body.collider, this.floorBody.collider, () => {
            hitFloor = true;
        });

        return hitFloor || nearFloor || belowPlatform;
    }

    private checkTowerCrashSounds(timeMs: number) {
        if (timeMs - this.lastCrashSoundAtMs < CRASH_SOUND_COOLDOWN_MS) return;

        const world = this.rapier.getWorld();
        const bodies: RapierBody[] = [];

        for (const target of this.towerTargets) {
            if (target.state !== 'dynamic') continue;
            for (const body of target.tower.bodies) {
                if (body.collider.shapeType() === RAPIER.ShapeType.Cuboid) {
                    bodies.push(body);
                }
            }
        }

        if (bodies.length < 2) return;

        for (let i = 0; i < bodies.length; i += 1) {
            const bodyA = bodies[i];
            const velA = bodyA.rigidBody.linvel();
            for (let j = i + 1; j < bodies.length; j += 1) {
                const bodyB = bodies[j];
                let hit = false;
                world.contactPair(bodyA.collider, bodyB.collider, () => {
                    hit = true;
                });
                if (!hit) continue;

                const velB = bodyB.rigidBody.linvel();
                const relativeSpeed = Math.hypot(velA.x - velB.x, velA.y - velB.y);
                if (relativeSpeed < CRASH_SOUND_MIN_RELATIVE_SPEED) continue;

                this.playCrashSound();
                this.lastCrashSoundAtMs = timeMs;
                return;
            }
        }
    }

    private checkDadBallKnockSound(timeMs: number) {
        if (!this.ballBody) return;
        if (timeMs - this.lastOwSoundAtMs < OW_SOUND_COOLDOWN_MS) return;

        const world = this.rapier.getWorld();
        const allBodies: RapierBody[] = [this.ballBody];
        const towerBallBodies: TowerBall[] = [];

        for (const target of this.towerTargets) {
            if (target.state !== 'dynamic') continue;
            allBodies.push(...target.tower.bodies);
            if (target.tower.ballBodies?.length) {
                towerBallBodies.push(...target.tower.ballBodies);
            }
        }

        if (!towerBallBodies.length) return;

        for (const towerBall of towerBallBodies) {
            const dadBody = towerBall.body;
            const dadVel = dadBody.rigidBody.linvel();
            for (const body of allBodies) {
                if (body === dadBody) continue;
                let hit = false;
                world.contactPair(dadBody.collider, body.collider, () => {
                    hit = true;
                });
                if (!hit) continue;

                const bodyVel = body.rigidBody.linvel();
                const relativeSpeed = Math.hypot(dadVel.x - bodyVel.x, dadVel.y - bodyVel.y);
                if (relativeSpeed < OW_SOUND_MIN_RELATIVE_SPEED) continue;

                this.sound.play('ow', { volume: 0.7 });
                this.lastOwSoundAtMs = timeMs;
                return;
            }
        }
    }

    private applyDadBallRollingResistance() {
        for (const target of this.towerTargets) {
            if (target.state !== 'dynamic') continue;
            const ballBodies = target.tower.ballBodies ?? [];
            for (const ball of ballBodies) {
                const centerY = ball.body.rigidBody.translation().y;
                const distToFloor = FLOOR_Y - centerY;
                const isOnGround = distToFloor <= ball.radius + 5;

                if (isOnGround) {
                    ball.body.rigidBody.setLinearDamping(1.5);
                    ball.body.rigidBody.setAngularDamping(1.5);
                } else {
                    ball.body.rigidBody.setLinearDamping(TOWER_BALL_AIR_DAMPING);
                    ball.body.rigidBody.setAngularDamping(TOWER_BALL_AIR_ANGULAR_DAMPING);
                }
            }
        }
    }

    private updateTowerBallEmotions() {
        if (!this.floorBody) return;
        const world = this.rapier.getWorld();

        const impactBodies: RapierBody[] = [];
        if (this.ballBody) impactBodies.push(this.ballBody);

        for (const target of this.towerTargets) {
            if (target.state !== 'dynamic') continue;
            impactBodies.push(...target.tower.bodies);
        }

        for (const target of this.towerTargets) {
            if (target.state !== 'dynamic') continue;
            const ballBodies = target.tower.ballBodies ?? [];
            for (const ball of ballBodies) {
                if (!ball.hasHitFloor) {
                    const centerY = ball.body.rigidBody.translation().y;
                    const distToFloor = FLOOR_Y - centerY;
                    const nearFloor = distToFloor <= ball.radius + TOWER_BALL_FLOOR_MARGIN;
                    let hitFloor = nearFloor;

                    if (!hitFloor) {
                        world.contactPair(ball.body.collider, this.floorBody.collider, () => {
                            hitFloor = true;
                        });
                    }

                    if (hitFloor) {
                        ball.hasHitFloor = true;
                        ball.hasBeenHit = true;
                        setBallMood(ball, 'grumpy');
                        continue;
                    }
                }

                if (ball.hasBeenHit) continue;
                const ballVel = ball.body.rigidBody.linvel();

                for (const body of impactBodies) {
                    if (body === ball.body) continue;
                    let hit = false;
                    world.contactPair(ball.body.collider, body.collider, () => {
                        hit = true;
                    });
                    if (!hit) continue;

                    const bodyVel = body.rigidBody.linvel();
                    const relativeSpeed = Math.hypot(ballVel.x - bodyVel.x, ballVel.y - bodyVel.y);
                    if (relativeSpeed < BALL_HIT_MIN_RELATIVE_SPEED) continue;

                    ball.hasBeenHit = true;
                    setBallMood(ball, 'surprised');
                    break;
                }
            }
        }
    }

    private playSplashSound() {
        const key = Phaser.Utils.Array.GetRandom(this.splashSoundKeys);
        this.sound.play(key, { volume: 0.6 });
    }

    private playCrashSound() {
        const key = Phaser.Utils.Array.GetRandom(this.crashSoundKeys);
        this.sound.play(key, { volume: 0.7 });
    }

    private handleInput() {
        if (this.levelComplete) {
            if (Phaser.Input.Keyboard.JustDown(this.resetKey)) {
                this.restartLevel();
            }
            return;
        }

        // Reset (after launch)
        if (this.hasLaunched) {
            if (Phaser.Input.Keyboard.JustDown(this.resetKey)) {
                this.restartLevel();
            }
            return;
        }

        const prevAngle = this.aimAngle;
        const prevPower = this.aimPower;

        // Angle (Left/Right)
        if (this.cursors.left.isDown) {
            this.aimAngle -= 1;
        } else if (this.cursors.right.isDown) {
            this.aimAngle += 1;
        }

        // Power (Up/Down)
        if (this.cursors.up.isDown) {
            this.aimPower += 10;
        } else if (this.cursors.down.isDown) {
            this.aimPower -= 10;
        }

        // Clamp
        this.aimAngle = Phaser.Math.Clamp(this.aimAngle, AIM_ANGLE_MIN_DEG, AIM_ANGLE_MAX_DEG);
        this.aimPower = Phaser.Math.Clamp(this.aimPower, AIM_POWER_MIN, this.maxAimPower);

    }

    private launch() {
        if (this.hasLaunched) return;
        this.hasLaunched = true;
        this.simStoppedAtMs = null;
        this.launchTimeMs = this.time.now;
        this.catapultProblem = undefined;
        this.catapultQuestionText.setText('');

        this.ballBody.rigidBody.setGravityScale(1, true);

        const rads = Phaser.Math.DegToRad(this.aimAngle);
        const vx = this.aimPower * Math.cos(rads);
        const vy = this.aimPower * Math.sin(rads);

        // Apply impulse (Mass * Velocity)
        // Ball mass is implicitly calculated by density, but we can force velocity directly for clarity
        this.ballBody.rigidBody.setLinvel({ x: vx, y: vy }, true);

        this.aimGraphics.clear();
    }

    private checkSimulationAutoReset(timeMs: number) {
        if (this.levelComplete) return;
        if (!this.hasLaunched) {
            this.simStoppedAtMs = null;
            return;
        }

        const bodies: RapierBody[] = [this.ballBody];
        for (const target of this.towerTargets) {
            for (const body of target.tower.bodies) {
                if (body.rigidBody.bodyType() !== RAPIER.RigidBodyType.Dynamic) continue;
                bodies.push(body);
            }
        }

        let isMoving = false;
        let maxLin = 0;
        let maxAng = 0;
        let sleepingCount = 0;
        const bodyStats: Array<{
            id: number;
            lin: number;
            ang: number;
            sleeping: boolean;
            x: number;
            y: number;
        }> = [];
        for (const body of bodies) {
            const vel = body.rigidBody.linvel();
            const speed = Math.hypot(vel.x, vel.y);
            const angSpeed = Math.abs(body.rigidBody.angvel());
            const sleeping = body.rigidBody.isSleeping();
            const pos = body.rigidBody.translation();
            maxLin = Math.max(maxLin, speed);
            maxAng = Math.max(maxAng, angSpeed);
            if (sleeping) sleepingCount += 1;
            bodyStats.push({
                id: body.collider.handle,
                lin: speed,
                ang: angSpeed,
                sleeping,
                x: pos.x,
                y: pos.y
            });
            if (speed > BALL_STOP_SPEED || angSpeed > SIM_STOP_ANGULAR_SPEED) {
                isMoving = true;
                break;
            }
        }

        if (isMoving) {
            if (this.simStoppedAtMs !== null) {
                console.log('[sim] movement resumed', {
                    maxLin: maxLin.toFixed(2),
                    maxAng: maxAng.toFixed(2),
                    sleeping: sleepingCount,
                    bodies: bodies.length
                });
            }
            this.simStoppedAtMs = null;
        } else {
            if (this.simStoppedAtMs === null) {
                const slowBodies = [...bodyStats]
                    .sort((a, b) => Math.max(b.lin, b.ang) - Math.max(a.lin, a.ang))
                    .slice(0, 6)
                    .map((stat) => ({
                        id: stat.id,
                        lin: stat.lin.toFixed(2),
                        ang: stat.ang.toFixed(2),
                        sleeping: stat.sleeping,
                        x: stat.x.toFixed(1),
                        y: stat.y.toFixed(1)
                    }));
                const sinceLaunchMs =
                    this.launchTimeMs === null ? null : Math.round(timeMs - this.launchTimeMs);
                console.log('[sim] considered stopped', {
                    maxLin: maxLin.toFixed(2),
                    maxAng: maxAng.toFixed(2),
                    sleeping: sleepingCount,
                    bodies: bodies.length,
                    thresholds: { lin: BALL_STOP_SPEED, ang: SIM_STOP_ANGULAR_SPEED },
                    sinceLaunchMs,
                    reason: sleepingCount === bodies.length ? 'allSleeping' : 'belowThresholds',
                    slowBodies
                });
                this.simStoppedAtMs = timeMs;
            }

            if (this.simStoppedAtMs !== null && timeMs - this.simStoppedAtMs >= BALL_RESET_DELAY_MS) {
                const sinceLaunchMs =
                    this.launchTimeMs === null ? null : Math.round(timeMs - this.launchTimeMs);
                console.log('[sim] auto-reset after idle', {
                    idleMs: Math.round(timeMs - this.simStoppedAtMs),
                    resetDelayMs: BALL_RESET_DELAY_MS,
                    sinceLaunchMs
                });
                this.resetBallToCatapult();
                return;
            }
        }

        // Fallback: reset after 7 seconds regardless of simulation state
        if (this.launchTimeMs !== null && timeMs - this.launchTimeMs >= 7000) {
            console.log('[sim] fallback reset after 7s timeout', {
                elapsedMs: Math.round(timeMs - this.launchTimeMs),
                maxLin: maxLin.toFixed(2),
                maxAng: maxAng.toFixed(2),
                sleeping: sleepingCount,
                bodies: bodies.length,
                simStoppedAtMs: this.simStoppedAtMs === null ? null : Math.round(this.simStoppedAtMs)
            });
            this.resetBallToCatapult();
        }
    }

    private completeLevel() {
        this.levelComplete = true;
        const isLastLevel = this.levelIndex >= LEVELS.length - 1;
        this.setFeedbackText(
            isLastLevel ? 'All levels cleared! Press Enter for settings.' : 'Level cleared! Press Enter for next level.'
        );
        this.winText.setVisible(true);
        this.catapultQuestionText.setText('');
        if (this.upgradeTitleText) this.upgradeTitleText.setVisible(false);
        if (this.upgradeQuestionTexts) {
            this.upgradeQuestionTexts.density.setVisible(false);
        }
        this.answerInputValue = '';
        this.updateAnswerText();
    }

    private advanceLevel() {
        if (!this.levelComplete) return;
        const isLastLevel = this.levelIndex >= LEVELS.length - 1;
        if (isLastLevel) {
            this.scene.start('SettingsScene');
            return;
        }
        const nextLevel = this.levelIndex + 1;
        gameState.levelIndex = nextLevel;
        this.scene.restart({ levelIndex: nextLevel });
    }

    private restartLevel() {
        this.scene.restart({ levelIndex: this.levelIndex });
    }

    private resetBallToCatapult() {
        this.hasLaunched = false;
        this.simStoppedAtMs = null;
        this.ballBody.rigidBody.setLinvel({ x: 0, y: 0 }, true);
        this.ballBody.rigidBody.setAngvel(0, true);
        this.ballBody.rigidBody.setTranslation(
            { x: this.catapultAnchor.x, y: this.catapultAnchor.y },
            true
        );
        this.ballBody.rigidBody.setGravityScale(0, true);
        this.ball.setPosition(this.catapultAnchor.x, this.catapultAnchor.y);
        this.createCatapultProblem();
        this.answerInputValue = '';
        this.updateAnswerText();
        this.setFeedbackText('');
        this.updateUI();
    }

    private updateUI() {
        const progress = this.towerBallTotal > 0 ? `${this.towerBallDown}/${this.towerBallTotal}` : '0/0';
        this.scoreText.setText(`BALLS DOWN: ${progress}\nSCORE: ${this.score}`);
    }

    private drawAimArrow() {
        if (this.hasLaunched) return;

        this.aimGraphics.clear();

        const startX = this.ball.x;
        const startY = this.ball.y;
        const rads = Phaser.Math.DegToRad(this.aimAngle);

        // Map power to pixel length.
        const powerT = Phaser.Math.Clamp(
            (this.aimPower - AIM_POWER_MIN) / (this.maxAimPower - AIM_POWER_MIN),
            0,
            1
        );
        const arrowLength = Phaser.Math.Linear(50, 400, powerT);

        const endX = startX + arrowLength * Math.cos(rads);
        const endY = startY + arrowLength * Math.sin(rads);

        this.aimGraphics.lineStyle(4, 0xffffff, 1);
        this.aimGraphics.beginPath();
        this.aimGraphics.moveTo(startX, startY);
        this.aimGraphics.lineTo(endX, endY);
        this.aimGraphics.strokePath();

        // Arrow head
        const headLen = 15;
        const angle1 = rads + Math.PI * 0.85;
        const angle2 = rads - Math.PI * 0.85;

        this.aimGraphics.beginPath();
        this.aimGraphics.moveTo(endX, endY);
        this.aimGraphics.lineTo(endX + headLen * Math.cos(angle1), endY + headLen * Math.sin(angle1));
        this.aimGraphics.moveTo(endX, endY);
        this.aimGraphics.lineTo(endX + headLen * Math.cos(angle2), endY + headLen * Math.sin(angle2));
        this.aimGraphics.strokePath();

        // Ghost Trajectory (line)
        this.aimGraphics.lineStyle(4, 0xffa500, 0.6); // Orange
        const vx = this.aimPower * Math.cos(rads);
        const vy = this.aimPower * Math.sin(rads);
        // Extend until the projectile returns to the launch height (symmetric about the apex).
        const tReturnToStartY = (-2 * vy) / GRAVITY_Y;
        const tEnd = Math.max(0, tReturnToStartY);
        const step = 0.02;
        this.aimGraphics.beginPath();
        for (let t = 0; t <= tEnd; t += step) {
            const tx = startX + vx * t;
            const ty = startY + vy * t + 0.5 * GRAVITY_Y * t * t;
            if (t === 0) this.aimGraphics.moveTo(tx, ty);
            else this.aimGraphics.lineTo(tx, ty);
        }
        this.aimGraphics.strokePath();
    }

    private updateCamera(delta: number) {
        // Get minimum zoom based on background bounds
        const minZoom = this.getMinZoomForBackground();
        const target = this.getCameraTarget(250, minZoom, 1.0);
        if (!target) {
            this.applyUiScale();
            return;
        }

        const camera = this.cameras.main;
        const smoothing = 1 - Math.pow(1 - this.cameraSmoothing, delta / 16.6667);

        const newZoom = Phaser.Math.Linear(camera.zoom, target.zoom, smoothing);
        let newX = Phaser.Math.Linear(camera.midPoint.x, target.x, smoothing);
        let newY = Phaser.Math.Linear(camera.midPoint.y, target.y, smoothing);

        // Clamp camera position to stay within background bounds
        const clamped = this.clampCameraToBackground(newX, newY, newZoom);
        if (clamped) {
            newX = clamped.x;
            newY = clamped.y;
        }

        camera.setZoom(newZoom);
        camera.centerOn(newX, newY);

        this.applyUiScale();

        // Update parallax background position
        this.updateParallaxBackground(newX, newY);
    }

    private clampCameraToBackground(x: number, y: number, zoom: number) {
        const bounds = this.getBackgroundBounds();
        if (!bounds) return null;

        const camera = this.cameras.main;
        const halfViewW = camera.width / (2 * zoom);
        const halfViewH = camera.height / (2 * zoom);

        const minX = bounds.left + halfViewW;
        const maxX = bounds.right - halfViewW;
        const minY = bounds.top + halfViewH;
        const maxY = bounds.bottom - halfViewH;

        return {
            x: minX > maxX ? (bounds.left + bounds.right) / 2 : Phaser.Math.Clamp(x, minX, maxX),
            y: minY > maxY ? (bounds.top + bounds.bottom) / 2 : Phaser.Math.Clamp(y, minY, maxY)
        };
    }

    private getCameraTarget(padding = 250, minZoom = 0.15, maxZoom = 1.0) {
        const camera = this.cameras.main;
        const viewWidth = camera.width / this.dpr;
        const viewHeight = camera.height / this.dpr;
        const trackedBalls = this.getBallTrackables();
        const trackedPlatforms = this.getPlatformTrackables();

        // Must have platforms to calculate camera target (we always have them after level init)
        if (!trackedPlatforms.length) return;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        // Always include catapult anchor so it stays visible
        minX = Math.min(minX, this.catapultAnchor.x);
        minY = Math.min(minY, this.catapultAnchor.y);
        maxX = Math.max(maxX, this.catapultAnchor.x);
        maxY = Math.max(maxY, this.catapultAnchor.y);

        // Always include platforms in bounds calculation so they stay visible
        for (const obj of trackedPlatforms) {
            const bounds = obj.getBounds();
            minX = Math.min(minX, bounds.x);
            minY = Math.min(minY, bounds.y);
            maxX = Math.max(maxX, bounds.right);
            maxY = Math.max(maxY, bounds.bottom);
        }

        // Also include balls
        for (const obj of trackedBalls) {
            const bounds = obj.getBounds();
            minX = Math.min(minX, bounds.x);
            minY = Math.min(minY, bounds.y);
            maxX = Math.max(maxX, bounds.right);
            maxY = Math.max(maxY, bounds.bottom);
        }

        if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return;

        const width = Math.max(1, maxX - minX);
        const height = Math.max(1, maxY - minY);
        const paddedWidth = width + padding * 2;
        const paddedHeight = height + padding * 2;

        const zoom = Phaser.Math.Clamp(Math.min(viewWidth / paddedWidth, viewHeight / paddedHeight), minZoom, maxZoom);
        const scaledZoom = zoom * this.dpr;

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        return { x: centerX, y: centerY, zoom: scaledZoom };
    }

    private getPlatformTrackables(): Trackable[] {
        // Return all platforms as trackables
        return this.platforms
            .filter(p => p.active)
            .map(p => p as unknown as Trackable);
    }

    private getBallTrackables(): Trackable[] {
        const tracked: Trackable[] = [];

        if (this.ball?.active) {
            tracked.push(this.ball as unknown as Trackable);
        }

        for (const target of this.towerTargets) {
            const balls = target.tower.ballBodies ?? [];
            for (const ball of balls) {
                if (!ball.sprite.active) continue;
                tracked.push(ball.sprite as unknown as Trackable);
            }
        }

        return tracked;
    }
}

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.WEBGL, // NineSlice is WebGL-only
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'app',
    backgroundColor: '#87CEEB',
    render: {
        antialias: true,
        pixelArt: false,
        roundPixels: false,
        mipmapFilter: 'LINEAR'
    },
    physics: { default: 'arcade', arcade: { debug: false } }, // Dummy for types, we use Rapier
    scene: [SettingsScene, MainScene]
};

new Phaser.Game(config);
