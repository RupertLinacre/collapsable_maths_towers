import Phaser from 'phaser';
import { RAPIER, createRapierPhysics } from './physics';
import type { RapierPhysics, RapierBody } from './physics';
import { TOWER_LIBRARY } from './towers';
import type { Trackable, TowerInstance, TowerSpawnContext } from './towers';
import {
    AIM_ANGLE_MAX_DEG,
    AIM_ANGLE_MIN_DEG,
    AIM_POWER_MAX,
    AIM_POWER_MIN,
    CATAPULT_HEIGHT_ABOVE_FLOOR,
    DEBUG_BOUNDS,
    DEBUG_RAPIER,
    LEVEL_PLATFORM_COUNT,
    LEVEL_PLATFORM_GAP_FRACTION,
    PERFECT_SHOT_ANGLE_DEG,
    PERFECT_SHOT_POWER,
    PLATFORM_HEIGHT,
    PLATFORM_PARABOLA_Y_OFFSET,
    PLATFORM_WIDTH
} from './config';

// Phaser does not await an async Scene.create(), so Rapier must be initialized
// before the game boots (otherwise update() runs with uninitialized state).
await RAPIER.init();

// --- CONFIGURATION ---
const GRAVITY_Y = 9.81 * 100; // 100 pixels = 1 meter
const FLOOR_Y = 800;
const CAMERA_FLOOR_PADDING = 60; // Show a small slice of the ground
const UNIVERSE_WIDTH = 200_000;
const BALL_RADIUS = 20;

class MainScene extends Phaser.Scene {
    private rapier!: RapierPhysics;

    // Game Objects
    private ball!: Phaser.GameObjects.Container;
    private ballBody!: RapierBody;
    private platforms: Phaser.GameObjects.Rectangle[] = [];
    private towers: TowerInstance[] = [];
    private floorBody!: RapierBody;

    private trackedObjects: { obj: Trackable; includeInBounds: boolean }[] = [];

    private trackObject = (obj: Trackable, includeInBounds = true) => {
        this.trackedObjects.push({ obj, includeInBounds });
    };

    // Controls & State
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private enterKey!: Phaser.Input.Keyboard.Key;
    private resetKey!: Phaser.Input.Keyboard.Key;
    private aimAngle: number = PERFECT_SHOT_ANGLE_DEG;
    private aimPower: number = PERFECT_SHOT_POWER;
    private hasLaunched = false;
    private cameraSmoothing = 0.06; // Smoothing per 60fps frame (Phaser style)

    // UI
    private aimGraphics!: Phaser.GameObjects.Graphics;
    private statsText!: Phaser.GameObjects.Text;
    private debugGraphics?: Phaser.GameObjects.Graphics;

    init() {
        // Reset core state on every restart (Scene is reused)
        this.hasLaunched = false;
        this.aimAngle = PERFECT_SHOT_ANGLE_DEG;
        this.aimPower = PERFECT_SHOT_POWER;

        this.platforms.length = 0;
        this.towers.length = 0;
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
        this.load.image('log1', new URL('./assets/images/log2.png', import.meta.url).toString());
        this.load.image('beaver', new URL('./assets/images/beaver.png', import.meta.url).toString());
    }

    create() {
        // 1. Init Physics
        const gravity = { x: 0, y: GRAVITY_Y };
        this.rapier = createRapierPhysics(gravity, this);
        const world = this.rapier.getWorld();
        world.integrationParameters.numSolverIterations = 50;
        world.integrationParameters.normalizedAllowedLinearError = 0.001;
        world.integrationParameters.lengthUnit = 1000;
        if (DEBUG_RAPIER) this.rapier.debugger(true);

        // 2. Create World
        this.createInfiniteFloor();
        this.createPlayerBall();

        // 3. Generate Level based on Math
        this.generateParabolaLevel();

        // 4. UI & Controls
        this.cursors = this.input.keyboard!.createCursorKeys();
        this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
        this.resetKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
        this.aimGraphics = this.add.graphics().setDepth(100);
        this.input.on(Phaser.Input.Events.POINTER_DOWN, this.launch, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.input.off(Phaser.Input.Events.POINTER_DOWN, this.launch, this);
        });

        this.statsText = this.add.text(20, 20, '', {
            fontSize: '32px',
            color: '#ffffff',
            backgroundColor: '#000000aa',
            padding: { x: 10, y: 10 }
        }).setScrollFactor(0).setDepth(1000);

        if (DEBUG_BOUNDS) {
            this.debugGraphics = this.add.graphics().setDepth(2000);
        }

        this.updateUI();
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

        // "Beaver" Visual (Container so we can add a ring)
        const container = this.add.container(startX, startY);
        container.setSize(BALL_RADIUS * 2, BALL_RADIUS * 2);

        const ring = this.add.circle(0, 0, BALL_RADIUS + 4, 0x000000, 0).setStrokeStyle(4, 0xffffff, 1);
        const beaver = this.add.image(0, 0, 'beaver');
        const scale = Math.min((BALL_RADIUS * 2) / beaver.width, (BALL_RADIUS * 2) / beaver.height);
        beaver.setScale(scale);
        container.add([ring, beaver]);

        this.ball = container;
        this.trackObject(this.ball as unknown as Trackable, true);

        this.ballBody = this.rapier.addRigidBody(container, {
            rigidBodyType: RAPIER.RigidBodyType.Dynamic,
            collider: RAPIER.ColliderDesc.ball(BALL_RADIUS)
        });

        // Float mode until launch
        this.ballBody.rigidBody.setGravityScale(0, true);
        this.ballBody.collider.setRestitution(0.4);
        this.ballBody.collider.setFriction(1.5);
        this.ballBody.collider.setDensity(500.0);
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
        this.platforms.push(platform);
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
        this.towers.push(instance);
    }

    // --- GAME LOOP ---

    update(_time: number, delta: number) {
        this.handleInput();
        this.updateCamera(delta);
        this.drawAimArrow();
        this.applyRollingResistance();
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
        const isOnGround = distToFloor <= BALL_RADIUS + 5;

        if (isOnGround) {
            this.ballBody.rigidBody.setLinearDamping(1.5);
            this.ballBody.rigidBody.setAngularDamping(1.5);
        } else {
            this.ballBody.rigidBody.setLinearDamping(0);
            this.ballBody.rigidBody.setAngularDamping(0);
        }
    }

    private handleInput() {
        // Reset (after launch)
        if (this.hasLaunched) {
            if (Phaser.Input.Keyboard.JustDown(this.cursors.space) || Phaser.Input.Keyboard.JustDown(this.resetKey)) {
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

        // Launch: Space or Enter (click/tap handled by pointer event)
        if (Phaser.Input.Keyboard.JustDown(this.cursors.space) || Phaser.Input.Keyboard.JustDown(this.enterKey)) {
            this.launch();
        }
    }

    private launch() {
        if (this.hasLaunched) return;
        this.hasLaunched = true;

        for (const tower of this.towers) {
            tower.enableDynamics?.();
        }

        this.ballBody.rigidBody.setGravityScale(1, true);

        const rads = Phaser.Math.DegToRad(this.aimAngle);
        const vx = this.aimPower * Math.cos(rads);
        const vy = this.aimPower * Math.sin(rads);

        // Apply impulse (Mass * Velocity)
        // Ball mass is implicitly calculated by density, but we can force velocity directly for clarity
        this.ballBody.rigidBody.setLinvel({ x: vx, y: vy }, true);

        this.statsText.setText('PRESS SPACE (or R) TO RESET');
        this.aimGraphics.clear();
    }

    private updateUI() {
        if (this.hasLaunched) return;
        this.statsText.setText(`ANGLE: ${Math.abs(this.aimAngle)}°\nPOWER: ${this.aimPower}`);
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
