import Phaser from 'phaser';
import { checkAnswer, generateProblem, type MathProblem } from 'maths-game-problem-generator';
import { RAPIER } from './physics';
import type { RapierPhysics, RapierBody } from './physics';
import { TOWER_LIBRARY } from './towers';
import type { Trackable, TowerInstance, TowerSpawnContext } from './towers';
import { GRAVITY_Y, createConfiguredRapier } from './physicsSettings';
import {
    AIM_ANGLE_MAX_DEG,
    AIM_ANGLE_MIN_DEG,
    AIM_POWER_MAX,
    AIM_POWER_MIN,
    BACKGROUND_ANCHOR_X,
    BACKGROUND_ANCHOR_Y,
    BACKGROUND_SCALE,
    BALL_RESET_DELAY_MS,
    CATAPULT_HEIGHT_ABOVE_FLOOR,
    BEAVER_DENSITY,
    BEAVER_RADIUS,
    DEBUG_BOUNDS,
    DEBUG_RAPIER,
    LEVEL_PLATFORM_COUNT,
    LEVEL_PLATFORM_GAP_FRACTION,
    MATH_YEAR_LEVEL,
    PERFECT_SHOT_ANGLE_DEG,
    PERFECT_SHOT_POWER,
    PLATFORM_HEIGHT,
    PLATFORM_PARABOLA_Y_OFFSET,
    PLATFORM_WIDTH,
    QUESTION_TEXT_OFFSET_Y,
    ANSWER_TEXT_OFFSET_Y
} from './config';
import logUrl from './assets/images/tower_objects/log.png?as=url';
import logFrozenUrl from './assets/images/tower_objects/log_frozen.png?as=url';
import beaverUrl from './assets/images/beaver.png?as=url';
import backgroundUrl from './assets/images/backgrounds/background.png?as=url';

// Phaser does not await an async Scene.create(), so Rapier must be initialized
// before the game boots (otherwise update() runs with uninitialized state).
await RAPIER.init();

// --- CONFIGURATION ---
const FLOOR_Y = 800;
const CAMERA_FLOOR_PADDING = 60; // Show a small slice of the ground
const UNIVERSE_WIDTH = 200_000;
const BALL_STOP_SPEED = 5;

type TowerTarget = {
    tower: TowerInstance;
    questionText: Phaser.GameObjects.Text;
    problem: MathProblem;
    state: TowerState;
};

type TowerState = 'frozen' | 'unfrozen' | 'dynamic';

class MainScene extends Phaser.Scene {
    private rapier!: RapierPhysics;
    private backgroundImage?: Phaser.GameObjects.Image;
    private backgroundAnchor = { x: BACKGROUND_ANCHOR_X, y: BACKGROUND_ANCHOR_Y };

    // Game Objects
    private ball!: Phaser.GameObjects.Container;
    private ballBody!: RapierBody;
    private towerTargets: TowerTarget[] = [];
    private floorBody!: RapierBody;

    private trackedObjects: { obj: Trackable; includeInBounds: boolean }[] = [];
    private catapultAnchor = { x: 0, y: 0 };

    private trackObject = (obj: Trackable, includeInBounds = true) => {
        this.trackedObjects.push({ obj, includeInBounds });
    };

    // Controls & State
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private resetKey!: Phaser.Input.Keyboard.Key;
    private aimAngle: number = PERFECT_SHOT_ANGLE_DEG;
    private aimPower: number = PERFECT_SHOT_POWER;
    private hasLaunched = false;
    private cameraSmoothing = 0.06; // Smoothing per 60fps frame (Phaser style)
    private score = 0;
    private scoredBodies = new Set<number>();
    private answerInputValue = '';
    private catapultProblem?: MathProblem;
    private ballStoppedAtMs: number | null = null;

    // UI
    private aimGraphics!: Phaser.GameObjects.Graphics;
    private statsText!: Phaser.GameObjects.Text;
    private scoreText!: Phaser.GameObjects.Text;
    private feedbackText!: Phaser.GameObjects.Text;
    private catapultQuestionText!: Phaser.GameObjects.Text;
    private answerBox!: Phaser.GameObjects.Rectangle;
    private answerText!: Phaser.GameObjects.Text;
    private answerHintText!: Phaser.GameObjects.Text;
    private debugGraphics?: Phaser.GameObjects.Graphics;
    private splashSoundKeys = ['splash1', 'splash2', 'splash3', 'splash4'];

    init() {
        // Reset core state on every restart (Scene is reused)
        this.hasLaunched = false;
        this.aimAngle = PERFECT_SHOT_ANGLE_DEG;
        this.aimPower = PERFECT_SHOT_POWER;
        this.score = 0;
        this.scoredBodies.clear();
        this.answerInputValue = '';
        this.catapultProblem = undefined;
        this.ballStoppedAtMs = null;

        this.towerTargets.length = 0;
        this.trackedObjects.length = 0;
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
        this.load.audio('splash1', new URL('./assets/sound_effects/splashing_sounds/1.mp3', import.meta.url).toString());
        this.load.audio('splash2', new URL('./assets/sound_effects/splashing_sounds/2.mp3', import.meta.url).toString());
        this.load.audio('splash3', new URL('./assets/sound_effects/splashing_sounds/3.mp3', import.meta.url).toString());
        this.load.audio('splash4', new URL('./assets/sound_effects/splashing_sounds/4.mp3', import.meta.url).toString());
    }

    create() {
        // 1. Init Physics
        this.rapier = createConfiguredRapier(this, DEBUG_RAPIER);

        // 2. Create World
        this.createInfiniteFloor();
        this.createPlayerBall();
        this.createBackground();

        // 3. Generate Level based on Math
        this.generateParabolaLevel();

        // 4. UI & Controls
        this.cursors = this.input.keyboard!.createCursorKeys();
        this.resetKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
        this.aimGraphics = this.add.graphics().setDepth(100);

        this.statsText = this.add.text(20, 20, '', {
            fontSize: '32px',
            color: '#ffffff',
            backgroundColor: '#000000aa',
            padding: { x: 10, y: 10 }
        }).setScrollFactor(0).setDepth(1000);

        this.scoreText = this.add.text(20, 110, '', {
            fontSize: '28px',
            color: '#ffffff',
            backgroundColor: '#000000aa',
            padding: { x: 10, y: 8 }
        }).setScrollFactor(0).setDepth(1000);

        this.feedbackText = this.add.text(20, 180, '', {
            fontSize: '26px',
            color: '#ffffff',
            backgroundColor: '#000000aa',
            padding: { x: 10, y: 8 }
        }).setScrollFactor(0).setDepth(1000);

        this.catapultQuestionText = this.add
            .text(
                this.catapultAnchor.x,
                Math.min(this.catapultAnchor.y + QUESTION_TEXT_OFFSET_Y, FLOOR_Y - 80),
                '',
                {
                fontSize: '32px',
                color: '#1b1b1b',
                backgroundColor: '#fff7c7',
                padding: { x: 12, y: 8 }
                }
            )
            .setOrigin(0.5, 0)
            .setDepth(900);

        this.createAnswerInput();
        this.createCatapultProblem();
        this.feedbackText.setText('Answer a tower to unfreeze it. Answer the catapult to launch!');
        this.input.keyboard?.on('keydown', this.handleAnswerKey, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.input.keyboard?.off('keydown', this.handleAnswerKey, this);
        });

        if (DEBUG_BOUNDS) {
            this.debugGraphics = this.add.graphics().setDepth(2000);
        }

        this.updateUI();
    }

    private createBackground() {
        this.backgroundImage = this.add
            .image(this.backgroundAnchor.x, this.backgroundAnchor.y, 'background')
            .setOrigin(0.5, 1)
            .setDepth(-100)
            .setAlpha(1);
        this.backgroundImage.setScale(BACKGROUND_SCALE);
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

    private createPlayerBall() {
        const startX = -600;
        const startY = FLOOR_Y - CATAPULT_HEIGHT_ABOVE_FLOOR;
        this.catapultAnchor = { x: startX, y: startY };

        // "Beaver" Visual (Container so we can add a ring)
        const container = this.add.container(startX, startY);
        container.setSize(BEAVER_RADIUS * 2, BEAVER_RADIUS * 2);

        const ring = this.add.circle(0, 0, BEAVER_RADIUS + 4, 0x000000, 0).setStrokeStyle(4, 0xffffff, 1);
        const beaver = this.add.image(0, 0, 'beaver');
        const scale = Math.min((BEAVER_RADIUS * 2) / beaver.width, (BEAVER_RADIUS * 2) / beaver.height);
        beaver.setScale(scale);
        container.add([ring, beaver]);

        this.ball = container;
        this.trackObject(this.ball as unknown as Trackable, true);

        this.ballBody = this.rapier.addRigidBody(container, {
            rigidBodyType: RAPIER.RigidBodyType.Dynamic,
            collider: RAPIER.ColliderDesc.ball(BEAVER_RADIUS)
        });

        // Float mode until launch
        this.ballBody.rigidBody.setGravityScale(0, true);
        this.ballBody.collider.setRestitution(0.4);
        this.ballBody.collider.setFriction(1.5);
        this.ballBody.collider.setDensity(BEAVER_DENSITY);
    }

    /**
     * The Maths part!
     * We calculate the trajectory of a projectile launched at PERFECT_SHOT_ANGLE_DEG and PERFECT_SHOT_POWER.
     * We place platforms along this path.
     */
    private generateParabolaLevel() {
        const startX = this.ball.x;
        const startY = this.ball.y;

        const rads = Phaser.Math.DegToRad(PERFECT_SHOT_ANGLE_DEG);
        const vx = PERFECT_SHOT_POWER * Math.cos(rads);
        const vy = PERFECT_SHOT_POWER * Math.sin(rads);

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

        const gap = Phaser.Math.Clamp(LEVEL_PLATFORM_GAP_FRACTION, 0, 0.99);
        const tStart = gap * tReturnToStartY;
        const tStartClamped = Math.min(tStart, tEnd);

        for (let i = 0; i < LEVEL_PLATFORM_COUNT; i++) {
            const alphaWithin = LEVEL_PLATFORM_COUNT === 1 ? 0.5 : i / (LEVEL_PLATFORM_COUNT - 1);
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

        const towerX = platformLeft + platW / 2;
        const surfaceY = platformTop;

        const ctx: TowerSpawnContext = {
            scene: this,
            rapier: this.rapier,
            x: towerX,
            surfaceY,
            trackObject: this.trackObject
        };

        const def = Phaser.Utils.Array.GetRandom(TOWER_LIBRARY);
        const instance = def.spawn(ctx);

        instance.setFrozenVisual?.(true);

        const problem = generateProblem({ yearLevel: MATH_YEAR_LEVEL });
        const questionText = this.add.text(towerX, surfaceY + ANSWER_TEXT_OFFSET_Y, `${problem.expression} = ?`, {
            fontSize: '32px',
            color: '#1b1b1b',
            backgroundColor: '#ffffffcc',
            padding: { x: 8, y: 4 }
        }).setOrigin(0.5, 0).setDepth(900);

        this.towerTargets.push({
            tower: instance,
            questionText,
            problem,
            state: 'frozen'
        });
    }

    private createCatapultProblem() {
        const problem = generateProblem({ yearLevel: MATH_YEAR_LEVEL });
        this.catapultProblem = problem;
        this.catapultQuestionText.setText(`${problem.expression} = ?`);
    }

    private createAnswerInput() {
        const camera = this.cameras.main;
        const boxWidth = 320;
        const boxHeight = 54;
        const x = camera.width / 2;
        const y = camera.height - 60;

        this.answerBox = this.add
            .rectangle(x, y, boxWidth, boxHeight, 0xffffff, 0.95)
            .setStrokeStyle(3, 0x2f2f2f, 1)
            .setScrollFactor(0)
            .setDepth(1000);

        this.answerText = this.add
            .text(x, y, '', { fontSize: '28px', color: '#1b1b1b' })
            .setOrigin(0.5, 0.5)
            .setScrollFactor(0)
            .setDepth(1001);

        this.answerHintText = this.add
            .text(x, y - 44, 'Type answer + Enter', { fontSize: '20px', color: '#f6f6f6' })
            .setOrigin(0.5, 0.5)
            .setScrollFactor(0)
            .setDepth(1001);

        this.updateAnswerText();
    }

    private updateAnswerText() {
        this.answerText.setText(this.answerInputValue);
        const hasInput = this.answerInputValue.length > 0;
        this.answerHintText.setVisible(!hasInput);
        this.answerBox.setStrokeStyle(3, hasInput ? 0x2f2f2f : 0x555555, 1);
    }

    private handleAnswerKey(event: KeyboardEvent) {
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

        let unfrozenCount = 0;
        for (const target of this.towerTargets) {
            if (target.state !== 'frozen') continue;
            if (checkAnswer(target.problem, answerValue)) {
                target.state = 'unfrozen';
                target.tower.setFrozenVisual?.(false);
                unfrozenCount += 1;
            }
        }

        let launched = false;
        if (!this.hasLaunched && this.catapultProblem && checkAnswer(this.catapultProblem, answerValue)) {
            launched = true;
            this.launch();
        }

        if (launched && unfrozenCount > 0) {
            this.feedbackText.setText(`Nice! ${unfrozenCount} tower${unfrozenCount === 1 ? '' : 's'} unfrozen.`);
        } else if (launched) {
            this.feedbackText.setText('Correct! Launching...');
        } else if (unfrozenCount > 0) {
            this.feedbackText.setText(`Great! ${unfrozenCount} tower${unfrozenCount === 1 ? '' : 's'} unfrozen.`);
        } else {
            this.feedbackText.setText('Not quite. Try again!');
        }

        this.answerInputValue = '';
        this.updateAnswerText();
    }

    // --- GAME LOOP ---

    update(time: number, delta: number) {
        this.handleInput();
        this.updateCamera(delta);
        this.drawAimArrow();
        this.applyRollingResistance();
        this.checkTowerActivations();
        this.checkTowerGroundHits();
        this.checkBallAutoReset(time);
        this.drawDebugBounds();
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

    private applyRollingResistance() {
        if (!this.ballBody) return;

        const centerY = this.ballBody.rigidBody.translation().y;
        const distToFloor = FLOOR_Y - centerY;
        const isOnGround = distToFloor <= BEAVER_RADIUS + 5;

        if (isOnGround) {
            this.ballBody.rigidBody.setLinearDamping(1.5);
            this.ballBody.rigidBody.setAngularDamping(1.5);
        } else {
            this.ballBody.rigidBody.setLinearDamping(0);
            this.ballBody.rigidBody.setAngularDamping(0);
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

    private playSplashSound() {
        const key = Phaser.Utils.Array.GetRandom(this.splashSoundKeys);
        this.sound.play(key, { volume: 0.6 });
    }

    private handleInput() {
        // Reset (after launch)
        if (this.hasLaunched) {
            if (Phaser.Input.Keyboard.JustDown(this.resetKey)) {
                this.scene.restart();
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
        this.aimPower = Phaser.Math.Clamp(this.aimPower, AIM_POWER_MIN, AIM_POWER_MAX);

        if (this.aimAngle !== prevAngle || this.aimPower !== prevPower) this.updateUI();

    }

    private launch() {
        if (this.hasLaunched) return;
        this.hasLaunched = true;
        this.ballStoppedAtMs = null;
        this.catapultProblem = undefined;
        this.catapultQuestionText.setText('');

        this.ballBody.rigidBody.setGravityScale(1, true);

        const rads = Phaser.Math.DegToRad(this.aimAngle);
        const vx = this.aimPower * Math.cos(rads);
        const vy = this.aimPower * Math.sin(rads);

        // Apply impulse (Mass * Velocity)
        // Ball mass is implicitly calculated by density, but we can force velocity directly for clarity
        this.ballBody.rigidBody.setLinvel({ x: vx, y: vy }, true);

        this.statsText.setText('PRESS R TO RESET');
        this.aimGraphics.clear();
    }

    private checkBallAutoReset(timeMs: number) {
        if (!this.hasLaunched) {
            this.ballStoppedAtMs = null;
            return;
        }

        const vel = this.ballBody.rigidBody.linvel();
        const speed = Math.hypot(vel.x, vel.y);
        if (speed > BALL_STOP_SPEED) {
            this.ballStoppedAtMs = null;
            return;
        }

        if (this.ballStoppedAtMs === null) {
            this.ballStoppedAtMs = timeMs;
            return;
        }

        if (timeMs - this.ballStoppedAtMs >= BALL_RESET_DELAY_MS) {
            this.resetBallToCatapult();
        }
    }

    private resetBallToCatapult() {
        this.hasLaunched = false;
        this.ballStoppedAtMs = null;
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
        this.feedbackText.setText('Answer the catapult to launch again!');
        this.updateUI();
    }

    private updateUI() {
        if (this.hasLaunched) {
            this.statsText.setText('PRESS R TO RESET');
        } else {
            this.statsText.setText(`ANGLE: ${Math.abs(this.aimAngle)}°\nPOWER: ${this.aimPower}`);
        }
        this.scoreText.setText(`SCORE: ${this.score}`);
    }

    private drawAimArrow() {
        if (this.hasLaunched) return;

        this.aimGraphics.clear();

        const startX = this.ball.x;
        const startY = this.ball.y;
        const rads = Phaser.Math.DegToRad(this.aimAngle);

        // Map power to pixel length.
        const powerT = Phaser.Math.Clamp((this.aimPower - AIM_POWER_MIN) / (AIM_POWER_MAX - AIM_POWER_MIN), 0, 1);
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
        const target = this.getCameraTarget(250, 0.15, 1.0);
        if (!target) return;

        const camera = this.cameras.main;
        const smoothing = 1 - Math.pow(1 - this.cameraSmoothing, delta / 16.6667);

        const newZoom = Phaser.Math.Linear(camera.zoom, target.zoom, smoothing);
        const newX = Phaser.Math.Linear(camera.midPoint.x, target.x, smoothing);
        const newY = this.getPinnedCenterY(newZoom);

        camera.setZoom(newZoom);
        camera.centerOn(newX, newY);
    }

    private getCameraTarget(padding = 250, minZoom = 0.15, maxZoom = 1.0) {
        const camera = this.cameras.main;
        const tracked: Trackable[] = [];

        for (const t of this.trackedObjects) {
            if (!t.includeInBounds) continue;
            if (!t.obj.active) continue;
            tracked.push(t.obj);
        }

        if (!tracked.length) return;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const obj of tracked) {
            const bounds = obj.getBounds();
            minX = Math.min(minX, bounds.x);
            minY = Math.min(minY, bounds.y);
            maxX = Math.max(maxX, bounds.right);
            maxY = Math.max(maxY, bounds.bottom);
        }

        if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return;

        const width = Math.max(1, maxX - minX);
        const paddedWidth = width + padding * 2;

        // Pin the bottom of the view to the floor with a little breathing room.
        const top = minY - padding;
        const bottom = FLOOR_Y + CAMERA_FLOOR_PADDING;
        const requiredHeight = Math.max(1, bottom - top);

        const zoom = Phaser.Math.Clamp(
            Math.min(camera.width / paddedWidth, camera.height / requiredHeight),
            minZoom,
            maxZoom
        );

        const centerX = (minX + maxX) / 2;
        const centerY = this.getPinnedCenterY(zoom);

        return { x: centerX, y: centerY, zoom };
    }

    private getPinnedCenterY(zoom: number) {
        const halfViewHeight = this.cameras.main.height / (2 * zoom);
        return (FLOOR_Y + CAMERA_FLOOR_PADDING) - halfViewHeight;
    }
}

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.WEBGL, // NineSlice is WebGL-only
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'app',
    backgroundColor: '#87CEEB',
    physics: { default: 'arcade', arcade: { debug: false } }, // Dummy for types, we use Rapier
    scene: [MainScene]
};

new Phaser.Game(config);
