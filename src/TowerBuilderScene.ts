import Phaser from 'phaser';
import { RAPIER } from './physics';
import type { RapierBody, RapierPhysics } from './physics';
import { DEBUG_RAPIER, PLANK_LENGTH, PLANK_WIDTH, PLATFORM_HEIGHT, PLATFORM_WIDTH } from './config';
import { createPlank, createPlankGhost, type PlankVisuals, type Trackable } from './towerPlanks';
import { assertWorldConfigured, createConfiguredRapier } from './physicsSettings';
import logUrl from './assets/images/tower_objects/log.png?as=url';
import logFrozenUrl from './assets/images/tower_objects/log_frozen.png?as=url';

type BuildMode = 'PAUSED' | 'RUNNING';

type PlankSpec = {
    dx: number;
    dy: number;
    w: number;
    h: number;
};

type PlacedPlank = {
    id: string;
    spec: PlankSpec;
    container: Phaser.GameObjects.Container;
    body: RapierBody;
};

type PlankOrientation = 'horizontal' | 'vertical';

type RepeatState = {
    held: boolean;
    heldTimeMs: number;
    repeatTimeMs: number;
};

const GRID = PLANK_WIDTH;
const MOVE_STEP = PLANK_WIDTH / 2;
const LENGTH_STEP = PLANK_WIDTH / 2;
const SNAP_STEP = MOVE_STEP;
const REPEAT_INITIAL_DELAY_MS = 240;
const REPEAT_INTERVAL_MS = 60;
const HUD_TEXT = 'Arrows move | R rotate | +/- length (half) | P place | Space test | Click remove | Download button';

export class TowerBuilderScene extends Phaser.Scene {
    private rapier!: RapierPhysics;
    private mode: BuildMode = 'PAUSED';
    private placed: PlacedPlank[] = [];
    private cursorSpec!: PlankSpec;
    private cursorOrientation: PlankOrientation = 'vertical';
    private cursorGhost?: Phaser.GameObjects.Container;
    private platformCenterX = 0;
    private surfaceY = 0;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private rotateKey!: Phaser.Input.Keyboard.Key;
    private placeKey!: Phaser.Input.Keyboard.Key;
    private spaceKey!: Phaser.Input.Keyboard.Key;
    private lengthenKeys: Phaser.Input.Keyboard.Key[] = [];
    private shortenKeys: Phaser.Input.Keyboard.Key[] = [];
    private modeText!: Phaser.GameObjects.Text;
    private plankIdCounter = 0;
    private repeatStates: Record<string, RepeatState> = {};

    private trackObject: (obj: Trackable, includeInBounds?: boolean) => void = () => {};

    constructor() {
        super('TowerBuilderScene');
    }

    preload() {
        this.load.image('log1', logUrl);
        this.load.image('log_frozen', logFrozenUrl);
    }

    create() {
        this.rapier = createConfiguredRapier(this, true);
        assertWorldConfigured(this.rapier.getWorld());

        const camera = this.cameras.main;
        this.platformCenterX = camera.width / 2;
        this.surfaceY = camera.height * 0.7;

        this.createPlatform();

        this.cursorSpec = {
            dx: 0,
            dy: -PLANK_LENGTH / 2,
            w: PLANK_WIDTH,
            h: PLANK_LENGTH
        };
        this.cursorOrientation = 'vertical';
        this.snapCursor();
        this.rebuildGhost();

        this.cursors = this.input.keyboard!.createCursorKeys();
        this.rotateKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
        this.placeKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.P);
        this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.lengthenKeys = [
            this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.PLUS),
            this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_ADD),
            this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.EQUALS)
        ];
        this.shortenKeys = [
            this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.MINUS),
            this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_SUBTRACT)
        ];

        this.add
            .text(20, 20, HUD_TEXT, {
                fontSize: '20px',
                color: '#ffffff',
                backgroundColor: '#000000aa',
                padding: { x: 10, y: 6 }
            })
            .setScrollFactor(0)
            .setDepth(1000);

        this.modeText = this.add
            .text(20, 60, 'Mode: PAUSED', {
                fontSize: '18px',
                color: '#ffffff',
                backgroundColor: '#000000aa',
                padding: { x: 10, y: 6 }
            })
            .setScrollFactor(0)
            .setDepth(1000);

        const downloadButton = this.add
            .text(camera.width - 20, 20, 'Download JSON', {
                fontSize: '18px',
                color: '#ffffff',
                backgroundColor: '#000000aa',
                padding: { x: 10, y: 6 }
            })
            .setOrigin(1, 0)
            .setScrollFactor(0)
            .setDepth(1000)
            .setInteractive({ useHandCursor: true });

        downloadButton.on('pointerdown', () => this.downloadJson());
    }

    update(_time: number, delta: number) {
        if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
            this.toggleSimulation();
        }

        if (this.mode !== 'PAUSED') return;

        if (this.cursors.left) {
            this.handleRepeat([this.cursors.left], 'move-left', delta, () => this.moveCursor(-MOVE_STEP, 0));
        }
        if (this.cursors.right) {
            this.handleRepeat([this.cursors.right], 'move-right', delta, () => this.moveCursor(MOVE_STEP, 0));
        }
        if (this.cursors.up) {
            this.handleRepeat([this.cursors.up], 'move-up', delta, () => this.moveCursor(0, -MOVE_STEP));
        }
        if (this.cursors.down) {
            this.handleRepeat([this.cursors.down], 'move-down', delta, () => this.moveCursor(0, MOVE_STEP));
        }

        if (Phaser.Input.Keyboard.JustDown(this.rotateKey)) {
            this.rotateCursor();
        }

        if (Phaser.Input.Keyboard.JustDown(this.placeKey)) {
            this.placePlank();
        }

        this.handleRepeat(this.lengthenKeys, 'lengthen', delta, () => this.adjustLength(LENGTH_STEP));
        this.handleRepeat(this.shortenKeys, 'shorten', delta, () => this.adjustLength(-LENGTH_STEP));
    }

    private createPlatform() {
        const platform = this.add.rectangle(
            this.platformCenterX,
            this.surfaceY + PLATFORM_HEIGHT / 2,
            PLATFORM_WIDTH,
            PLATFORM_HEIGHT,
            0x555555
        );

        this.rapier.addRigidBody(platform, {
            rigidBodyType: RAPIER.RigidBodyType.Fixed,
            collider: RAPIER.ColliderDesc.cuboid(PLATFORM_WIDTH / 2, PLATFORM_HEIGHT / 2)
        });
    }

    private rebuildGhost() {
        this.cursorGhost?.destroy();
        const x = this.platformCenterX + this.cursorSpec.dx;
        const y = this.surfaceY + this.cursorSpec.dy;
        this.cursorGhost = createPlankGhost(this, x, y, this.cursorSpec.w, this.cursorSpec.h);
        this.cursorGhost.setAlpha(0.5).setDepth(200);
        this.cursorGhost.setVisible(this.mode === 'PAUSED');
    }

    private syncGhostPosition() {
        if (!this.cursorGhost) return;
        const x = this.platformCenterX + this.cursorSpec.dx;
        const y = this.surfaceY + this.cursorSpec.dy;
        this.cursorGhost.setPosition(x, y);
    }

    private gridSnap(value: number) {
        return Math.round(value / SNAP_STEP) * SNAP_STEP;
    }

    private snapDy(dy: number, h: number) {
        const bottomRelative = dy + h / 2;
        const snappedBottom = Math.round(bottomRelative / SNAP_STEP) * SNAP_STEP;
        return snappedBottom - h / 2;
    }

    private snapCursor() {
        this.cursorSpec.dx = this.snapDx(this.cursorSpec.dx, this.cursorSpec.w);
        this.cursorSpec.dy = this.snapDy(this.cursorSpec.dy, this.cursorSpec.h);
    }

    private snapDx(dx: number, w: number) {
        const leftEdge = dx - w / 2;
        const snappedLeft = this.gridSnap(leftEdge);
        return snappedLeft + w / 2;
    }

    private moveCursor(dx: number, dy: number) {
        this.cursorSpec.dx += dx;
        this.cursorSpec.dy += dy;
        this.snapCursor();
        this.syncGhostPosition();
    }

    private rotateCursor() {
        const bottomRelative = this.cursorSpec.dy + this.cursorSpec.h / 2;
        const leftEdge = this.cursorSpec.dx - this.cursorSpec.w / 2;
        const currentLength = Math.max(this.cursorSpec.w, this.cursorSpec.h);
        this.cursorOrientation = this.cursorOrientation === 'vertical' ? 'horizontal' : 'vertical';
        if (this.cursorOrientation === 'horizontal') {
            this.cursorSpec.w = currentLength;
            this.cursorSpec.h = PLANK_WIDTH;
        } else {
            this.cursorSpec.w = PLANK_WIDTH;
            this.cursorSpec.h = currentLength;
        }
        this.cursorSpec.dy = bottomRelative - this.cursorSpec.h / 2;
        this.cursorSpec.dx = leftEdge + this.cursorSpec.w / 2;
        this.snapCursor();
        this.rebuildGhost();
    }

    private adjustLength(delta: number) {
        const currentLength = Math.max(this.cursorSpec.w, this.cursorSpec.h);
        const nextLength = Math.max(PLANK_WIDTH, currentLength + delta);
        if (nextLength === currentLength) return;

        const bottomRelative = this.cursorSpec.dy + this.cursorSpec.h / 2;
        const leftEdge = this.cursorSpec.dx - this.cursorSpec.w / 2;

        if (this.cursorOrientation === 'horizontal') {
            this.cursorSpec.w = nextLength;
            this.cursorSpec.h = PLANK_WIDTH;
            this.cursorSpec.dx = leftEdge + this.cursorSpec.w / 2;
        } else {
            this.cursorSpec.w = PLANK_WIDTH;
            this.cursorSpec.h = nextLength;
        }

        this.cursorSpec.dy = bottomRelative - this.cursorSpec.h / 2;
        this.snapCursor();
        this.rebuildGhost();
    }

    private handleRepeat(
        keys: Phaser.Input.Keyboard.Key[],
        id: string,
        deltaMs: number,
        action: () => void
    ) {
        if (keys.length === 0) return;
        const isDown = keys.some((key) => key.isDown);
        const state = this.repeatStates[id] ?? { held: false, heldTimeMs: 0, repeatTimeMs: 0 };

        if (!isDown) {
            state.held = false;
            state.heldTimeMs = 0;
            state.repeatTimeMs = 0;
            this.repeatStates[id] = state;
            return;
        }

        if (!state.held) {
            state.held = true;
            state.heldTimeMs = 0;
            state.repeatTimeMs = 0;
            action();
            this.repeatStates[id] = state;
            return;
        }

        state.heldTimeMs += deltaMs;
        if (state.heldTimeMs >= REPEAT_INITIAL_DELAY_MS) {
            state.repeatTimeMs += deltaMs;
            while (state.repeatTimeMs >= REPEAT_INTERVAL_MS) {
                action();
                state.repeatTimeMs -= REPEAT_INTERVAL_MS;
            }
        }

        this.repeatStates[id] = state;
    }

    private placePlank() {
        if (this.mode !== 'PAUSED') return;
        const x = this.platformCenterX + this.cursorSpec.dx;
        const y = this.surfaceY + this.cursorSpec.dy;

        const objects: Trackable[] = [];
        const bodies: RapierBody[] = [];
        const visuals: PlankVisuals[] = [];
        const { rect, body } = createPlank(
            {
                scene: this,
                rapier: this.rapier,
                trackObject: this.trackObject
            },
            objects,
            bodies,
            visuals,
            x,
            y,
            this.cursorSpec.w,
            this.cursorSpec.h,
            false,
            RAPIER.RigidBodyType.Fixed
        );

        rect.setDepth(150);
        rect.setInteractive(
            new Phaser.Geom.Rectangle(-this.cursorSpec.w / 2, -this.cursorSpec.h / 2, this.cursorSpec.w, this.cursorSpec.h),
            Phaser.Geom.Rectangle.Contains
        );

        const id = `plank-${this.plankIdCounter++}`;
        const spec: PlankSpec = {
            dx: this.cursorSpec.dx,
            dy: this.cursorSpec.dy,
            w: this.cursorSpec.w,
            h: this.cursorSpec.h
        };

        this.placed.push({ id, spec, container: rect, body });

        rect.on('pointerdown', () => this.removePlaced(id));
    }

    private toggleSimulation() {
        if (this.mode === 'PAUSED') {
            for (const entry of this.placed) {
                entry.body.rigidBody.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
                entry.body.rigidBody.wakeUp();
            }
            this.setMode('RUNNING');
            return;
        }

        this.resetPlaced();
        this.setMode('PAUSED');
    }

    private resetPlaced() {
        for (const entry of this.placed) {
            const x = this.platformCenterX + entry.spec.dx;
            const y = this.surfaceY + entry.spec.dy;

            entry.body.rigidBody.setBodyType(RAPIER.RigidBodyType.Fixed, true);
            entry.body.rigidBody.setTranslation({ x, y }, true);
            entry.body.rigidBody.setRotation(0, true);
            entry.body.rigidBody.setLinvel({ x: 0, y: 0 }, true);
            entry.body.rigidBody.setAngvel(0, true);

            entry.container.setPosition(x, y);
            entry.container.setRotation(0);
        }
    }

    private setMode(mode: BuildMode) {
        this.mode = mode;
        this.modeText.setText(`Mode: ${mode}`);
        if (this.cursorGhost) {
            this.cursorGhost.setVisible(mode === 'PAUSED');
        }
    }

    private removePlaced(id: string) {
        if (this.mode !== 'PAUSED') return;
        const index = this.placed.findIndex((entry) => entry.id === id);
        if (index === -1) return;

        const [entry] = this.placed.splice(index, 1);
        this.rapier.destroy(entry.container);
    }

    private downloadJson() {
        const payload = {
            id: `manual-${Date.now()}`,
            parts: this.placed.map((entry) => entry.spec)
        };

        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = `${payload.id}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }
}
