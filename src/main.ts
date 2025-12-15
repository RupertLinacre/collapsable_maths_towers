import Phaser from 'phaser';
import { RAPIER, createRapierPhysics } from './physics';
import type { RapierPhysics, RapierBody } from './physics';

// Phaser does not await an async Scene.create(), so Rapier must be initialized
// before the game boots (otherwise update() runs with uninitialized state).
await RAPIER.init();

// --- CONFIGURATION ---
const GRAVITY_Y = 9.81 * 100; // 100 pixels = 1 meter
const FLOOR_Y = 800;
const CAMERA_FLOOR_PADDING = 60; // Show a small slice of the ground
const UNIVERSE_WIDTH = 200_000;
const BALL_RADIUS = 20;

// "Perfect Shot" definition (used to generate the level)
const IDEAL_ANGLE = -55; // Degrees (Negative is up)
const IDEAL_SPEED = 1100;

class MainScene extends Phaser.Scene {
    private rapier!: RapierPhysics;

    // Game Objects
    private ball!: Phaser.GameObjects.Container;
    private ballBody!: RapierBody;
    private dominoes: Phaser.GameObjects.Rectangle[] = [];
    private floorBody!: RapierBody;

    // Controls & State
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private enterKey!: Phaser.Input.Keyboard.Key;
    private resetKey!: Phaser.Input.Keyboard.Key;
    private aimAngle: number = -45;
    private aimPower: number = 800;
    private hasLaunched = false;

    // UI
    private aimGraphics!: Phaser.GameObjects.Graphics;
    private statsText!: Phaser.GameObjects.Text;

    init() {
        // Reset core state on every restart (Scene is reused)
        this.hasLaunched = false;
        this.aimAngle = -45;
        this.aimPower = 800;
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
    }

    create() {
        // 1. Init Physics
        this.rapier = createRapierPhysics(new RAPIER.Vector2(0, GRAVITY_Y), this);
        // this.rapier.debugger(true); // Uncomment to see physics lines

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
        const startY = FLOOR_Y - 50;

        // "Beaver" Visual (Container so we can add simple face details)
        const container = this.add.container(startX, startY);
        container.setSize(BALL_RADIUS * 2, BALL_RADIUS * 2);

        const bodyShape = this.add.circle(0, 0, BALL_RADIUS, 0x8B4513); // SaddleBrown
        const eye = this.add.circle(7, -5, 5, 0xffffff);
        const pupil = this.add.circle(8, -5, 2, 0x000000);
        const tooth = this.add.rectangle(10, 8, 6, 8, 0xffffff);
        container.add([bodyShape, tooth, eye, pupil]);

        this.ball = container;

        this.ballBody = this.rapier.addRigidBody(container, {
            rigidBodyType: RAPIER.RigidBodyType.Dynamic,
            collider: RAPIER.ColliderDesc.ball(BALL_RADIUS)
        });

        // Float mode until launch
        this.ballBody.rigidBody.setGravityScale(0, true);
        this.ballBody.collider.setRestitution(0.4);
        this.ballBody.collider.setDensity(2.0);
    }

    /**
     * The Maths part!
     * We calculate the trajectory of a projectile launched at IDEAL_ANGLE and IDEAL_SPEED.
     * We place platforms along this path.
     */
    private generateParabolaLevel() {
        const startX = this.ball.x;
        const startY = this.ball.y;

        const rads = Phaser.Math.DegToRad(IDEAL_ANGLE);
        const vx = IDEAL_SPEED * Math.cos(rads);
        const vy = IDEAL_SPEED * Math.sin(rads);

        // We sample time 't' (seconds) into the future
        // We start at 0.3s so we don't spawn blocks on top of the player
        // We stop when the y hits the floor

        const timeStep = 0.45; // Place a platform every 0.45 seconds of flight
        let t = 0.4;

        while (true) {
            // Kinematic Equation: p = p0 + v*t + 0.5*a*t^2
            const x = startX + vx * t;
            const y = startY + vy * t + 0.5 * GRAVITY_Y * t * t;

            if (y > FLOOR_Y - 40) break; // Hit the floor

            this.createPlatformWithDomino(x, y);
            t += timeStep;
        }
    }

    private createPlatformWithDomino(x: number, y: number) {
        // Align platform left edge to the parabola point so a "perfect" shot meets the domino first.
        const platformLeft = x;
        const platW = 100;
        const platH = 20;
        const platform = this.add.rectangle(platformLeft + platW / 2, y + 40, platW, platH, 0x555555); // Dark Grey

        this.rapier.addRigidBody(platform, {
            rigidBodyType: RAPIER.RigidBodyType.Fixed,
            collider: RAPIER.ColliderDesc.cuboid(platW / 2, platH / 2)
        });

        // 2. The Domino (Target)
        const domW = 20;
        const domH = 60;
        // Place slightly above platform
        const domino = this.add.rectangle(platformLeft + domW / 2, y - 10, domW, domH, 0xFFD700); // Gold

        const domBody = this.rapier.addRigidBody(domino, {
            rigidBodyType: RAPIER.RigidBodyType.Dynamic,
            collider: RAPIER.ColliderDesc.cuboid(domW / 2, domH / 2)
        });
        domBody.collider.setFriction(0.5);
        domBody.collider.setRestitution(0.1);

        this.dominoes.push(domino);
    }

    // --- GAME LOOP ---

    update(_time: number, delta: number) {
        this.handleInput();
        this.updateCamera(delta);
        this.drawAimArrow();
    }

    private handleInput() {
        // Reset (after launch)
        if (this.hasLaunched) {
            if (Phaser.Input.Keyboard.JustDown(this.cursors.space) || Phaser.Input.Keyboard.JustDown(this.resetKey)) {
                this.scene.restart();
            }
            return;
        }

        let changed = false;

        // Angle (Left/Right)
        if (this.cursors.left.isDown) {
            this.aimAngle -= 1;
            changed = true;
        } else if (this.cursors.right.isDown) {
            this.aimAngle += 1;
            changed = true;
        }

        // Power (Up/Down)
        if (this.cursors.up.isDown) {
            this.aimPower += 10;
            changed = true;
        } else if (this.cursors.down.isDown) {
            this.aimPower -= 10;
            changed = true;
        }

        // Clamp
        this.aimAngle = Phaser.Math.Clamp(this.aimAngle, -90, 0);
        this.aimPower = Phaser.Math.Clamp(this.aimPower, 100, 2000);

        if (changed) this.updateUI();

        // Launch: Space or Enter (click/tap handled by pointer event)
        if (Phaser.Input.Keyboard.JustDown(this.cursors.space) || Phaser.Input.Keyboard.JustDown(this.enterKey)) {
            this.launch();
        }
    }

    private launch() {
        if (this.hasLaunched) return;
        this.hasLaunched = true;
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

        // Map power (100-2000) to pixel length (50-300)
        const arrowLength = Phaser.Math.Linear(50, 400, (this.aimPower - 100) / 1900);

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

        // Ghost Trajectory (dots)
        this.aimGraphics.fillStyle(0xffffff, 0.3);
        const vx = this.aimPower * Math.cos(rads);
        const vy = this.aimPower * Math.sin(rads);
        for (let t = 0.1; t < 1.0; t += 0.1) {
            const tx = startX + vx * t;
            const ty = startY + vy * t + 0.5 * GRAVITY_Y * t * t;
            this.aimGraphics.fillCircle(tx, ty, 3);
        }
    }

    private updateCamera(delta: number) {
        const camera = this.cameras.main;

        // Find Bounds
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        let hasPoints = false;

        // 1. Always track player
        if (this.ball.active) {
            minX = Math.min(minX, this.ball.x);
            maxX = Math.max(maxX, this.ball.x);
            minY = Math.min(minY, this.ball.y);
            maxY = Math.max(maxY, this.ball.y);
            hasPoints = true;
        }

        // 2. Track Dominos that are moving (optional, or just track all)
        this.dominoes.forEach(d => {
            // Only track if active
            if (d.active) {
                minX = Math.min(minX, d.x);
                maxX = Math.max(maxX, d.x);
                minY = Math.min(minY, d.y);
                maxY = Math.max(maxY, d.y);
            }
        });

        if (!hasPoints) return;

        // Add padding
        const pad = 250;
        const width = Math.max(800, (maxX - minX) + pad * 2);
        const height = Math.max(600, (maxY - minY) + pad * 2);

        // Calculate Zoom to fit
        const zoomX = camera.width / width;
        const zoomY = camera.height / height;
        let targetZoom = Math.min(zoomX, zoomY);

        // Clamp Zoom
        targetZoom = Phaser.Math.Clamp(targetZoom, 0.15, 1.0);

        // Smooth Zoom
        const smoothFactor = 1.0 - Math.pow(0.01, delta / 1000); // Frame-rate independent smoothing
        camera.zoom = Phaser.Math.Linear(camera.zoom, targetZoom, smoothFactor);

        // Calculate Target Center X
        const targetX = (minX + maxX) / 2;

        // Scroll values are world top-left; account for zoom.
        // Keep the floor slightly visible at the bottom: bottomWorld = FLOOR_Y + padding
        const targetScrollX = targetX - camera.width / (2 * camera.zoom);
        const targetScrollY = (FLOOR_Y + CAMERA_FLOOR_PADDING) - camera.height / camera.zoom;

        camera.scrollX = Phaser.Math.Linear(camera.scrollX, targetScrollX, smoothFactor);
        camera.scrollY = Phaser.Math.Linear(camera.scrollY, targetScrollY, smoothFactor);
    }
}

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'app',
    backgroundColor: '#87CEEB',
    physics: { default: 'arcade', arcade: { debug: false } }, // Dummy for types, we use Rapier
    scene: [MainScene]
};

new Phaser.Game(config);
