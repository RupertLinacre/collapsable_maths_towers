import Phaser from 'phaser';
import { RAPIER } from './physics';
import type { RapierBody, RapierPhysics } from './physics';
import { BEAVER_RADIUS, DEBUG_RAPIER, PLANK_LENGTH, PLANK_WIDTH, PLATFORM_HEIGHT, PLATFORM_WIDTH } from './config';
import { createPlank, createPlankGhost, type PlankVisuals, type Trackable } from './towerPlanks';
import { createBall, createBallGhost } from './towerBalls';
import { assertWorldConfigured, createConfiguredRapier } from './physicsSettings';
import { applyHiDpi } from './hiDpi';
import logUrl from './assets/images/tower_objects/log.png?as=url';
import logFrozenUrl from './assets/images/tower_objects/log_frozen.png?as=url';
import ballHappyUrl from './assets/images/balls/dad/ball_happy.png?as=url';

type BuildMode = 'PAUSED' | 'RUNNING';

type BuilderObjectType = 'plank' | 'ball';

type CursorSpec = {
    dx: number;
    dy: number;
    w: number;
    h: number;
};

type PlankSpec = {
    type: 'plank';
    dx: number;
    dy: number;
    w: number;
    h: number;
};

type BallSpec = {
    type: 'ball';
    dx: number;
    dy: number;
    r: number;
};

type BuilderSpec = PlankSpec | BallSpec;

type PlacedObject = {
    id: string;
    spec: BuilderSpec;
    container: Phaser.GameObjects.GameObject;
    body: RapierBody;
};

type PlankOrientation = 'horizontal' | 'vertical';

type RepeatState = {
    held: boolean;
    heldTimeMs: number;
    repeatTimeMs: number;
};

type ObjectButton = {
    container: Phaser.GameObjects.Container;
    background: Phaser.GameObjects.Rectangle;
    icon: Phaser.GameObjects.Image;
    label: Phaser.GameObjects.Text;
};

const GRID = PLANK_WIDTH;
const MOVE_STEP = PLANK_WIDTH / 2;
const LENGTH_STEP = PLANK_WIDTH / 2;
const SNAP_STEP = MOVE_STEP;
const BUILDER_BALL_RADIUS = PLANK_WIDTH;
const REPEAT_INITIAL_DELAY_MS = 240;
const REPEAT_INTERVAL_MS = 60;
const HUD_TEXT =
    'Arrows move | R rotate (plank) | +/- length (plank) | P place | Space test | Click remove | Select object below | Load button | Download button';

export class TowerBuilderScene extends Phaser.Scene {
    private rapier!: RapierPhysics;
    private mode: BuildMode = 'PAUSED';
    private placed: PlacedObject[] = [];
    private selectedObject: BuilderObjectType = 'plank';
    private plankCursorSpec!: CursorSpec;
    private ballCursorSpec!: CursorSpec;
    private cursorOrientation: PlankOrientation = 'vertical';
    private cursorGhost?: Phaser.GameObjects.Container | Phaser.GameObjects.Image;
    private platformCenterX = 0;
    private surfaceY = 0;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private rotateKey!: Phaser.Input.Keyboard.Key;
    private placeKey!: Phaser.Input.Keyboard.Key;
    private spaceKey!: Phaser.Input.Keyboard.Key;
    private lengthenKeys: Phaser.Input.Keyboard.Key[] = [];
    private shortenKeys: Phaser.Input.Keyboard.Key[] = [];
    private modeText!: Phaser.GameObjects.Text;
    private objectIdCounter = 0;
    private repeatStates: Record<string, RepeatState> = {};
    private objectButtons: Record<BuilderObjectType, ObjectButton> = {} as Record<BuilderObjectType, ObjectButton>;
    private loadInput?: HTMLInputElement;

    private trackObject: (obj: Trackable, includeInBounds?: boolean) => void = () => {};

    constructor() {
        super('TowerBuilderScene');
    }

    preload() {
        this.load.image('log1', logUrl);
        this.load.image('log_frozen', logFrozenUrl);
        this.load.image('ball_happy', ballHappyUrl);
    }

    create() {
        const { dpr } = applyHiDpi(this.scale);
        this.rapier = createConfiguredRapier(this, true);
        assertWorldConfigured(this.rapier.getWorld());

        const camera = this.cameras.main;
        camera.setZoom(dpr);
        const viewWidth = camera.width / camera.zoom;
        const viewHeight = camera.height / camera.zoom;
        this.platformCenterX = viewWidth / 2;
        this.surfaceY = viewHeight * 0.7;

        this.createPlatform();

        this.plankCursorSpec = {
            dx: 0,
            dy: -PLANK_LENGTH / 2,
            w: PLANK_WIDTH,
            h: PLANK_LENGTH
        };
        this.ballCursorSpec = {
            dx: 0,
            dy: -BUILDER_BALL_RADIUS,
            w: BUILDER_BALL_RADIUS * 2,
            h: BUILDER_BALL_RADIUS * 2
        };
        this.cursorOrientation = 'vertical';
        this.snapCursor(this.plankCursorSpec, 'plank');
        this.snapCursor(this.ballCursorSpec, 'ball');
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

        this.createObjectSelector();

        const downloadButton = this.add
            .text(viewWidth - 20, 20, 'Download JSON', {
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

        const loadButton = this.add
            .text(0, 20, 'Load JSON', {
                fontSize: '18px',
                color: '#ffffff',
                backgroundColor: '#000000aa',
                padding: { x: 10, y: 6 }
            })
            .setOrigin(1, 0)
            .setScrollFactor(0)
            .setDepth(1000)
            .setInteractive({ useHandCursor: true });

        loadButton.setPosition(downloadButton.x - downloadButton.width - 12, 20);
        loadButton.on('pointerdown', () => this.promptLoadJson());

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.loadInput?.remove();
            this.loadInput = undefined;
        });
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

        if (Phaser.Input.Keyboard.JustDown(this.rotateKey) && this.selectedObject === 'plank') {
            this.rotateCursor();
        }

        if (Phaser.Input.Keyboard.JustDown(this.placeKey)) {
            this.placeSelectedObject();
        }

        if (this.selectedObject === 'plank') {
            this.handleRepeat(this.lengthenKeys, 'lengthen', delta, () => this.adjustLength(LENGTH_STEP));
            this.handleRepeat(this.shortenKeys, 'shorten', delta, () => this.adjustLength(-LENGTH_STEP));
        }
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

    private createObjectSelector() {
        const camera = this.cameras.main;
        const ui = this.add.container(viewWidth / 2, viewHeight - 40).setScrollFactor(0).setDepth(1000);

        const label = this.add
            .text(0, -18, 'Object', {
                fontSize: '16px',
                color: '#ffffff',
                backgroundColor: '#000000aa',
                padding: { x: 8, y: 4 }
            })
            .setOrigin(0.5, 0.5);

        const buttonW = 96;
        const buttonH = 44;
        const spacing = 14;
        const totalWidth = buttonW * 2 + spacing;
        const leftX = -totalWidth / 2 + buttonW / 2;
        const rightX = leftX + buttonW + spacing;

        const plankButton = this.createObjectButton(
            ui,
            leftX,
            12,
            'plank',
            'log1',
            'Plank',
            buttonW,
            buttonH,
            64,
            18
        );
        const ballButton = this.createObjectButton(
            ui,
            rightX,
            12,
            'ball',
            'ball_happy',
            'Ball',
            buttonW,
            buttonH,
            30,
            30
        );

        ui.add(label);

        this.objectButtons = {
            plank: plankButton,
            ball: ballButton
        };

        this.updateObjectSelectorVisuals();
    }

    private createObjectButton(
        parent: Phaser.GameObjects.Container,
        x: number,
        y: number,
        type: BuilderObjectType,
        textureKey: string,
        label: string,
        width: number,
        height: number,
        iconW: number,
        iconH: number
    ) {
        const container = this.add.container(x, y);
        const background = this.add.rectangle(0, 0, width, height, 0x000000, 0.35).setStrokeStyle(2, 0xffffff, 0.4);
        const icon = this.add.image(0, -4, textureKey).setDisplaySize(iconW, iconH);
        const text = this.add.text(0, height / 2 - 12, label, {
            fontSize: '12px',
            color: '#ffffff'
        }).setOrigin(0.5, 0.5);

        container.add([background, icon, text]);
        container.setSize(width, height);
        container.setInteractive(new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height), Phaser.Geom.Rectangle.Contains);
        container.on('pointerdown', () => this.setSelectedObject(type));

        parent.add(container);
        return { container, background, icon, label: text };
    }

    private setSelectedObject(type: BuilderObjectType) {
        if (this.selectedObject === type) return;
        this.selectedObject = type;
        this.snapCursor(this.getActiveCursorSpec(), this.selectedObject);
        this.rebuildGhost();
        this.updateObjectSelectorVisuals();
    }

    private updateObjectSelectorVisuals() {
        for (const [type, button] of Object.entries(this.objectButtons) as [BuilderObjectType, ObjectButton][]) {
            const selected = type === this.selectedObject;
            const fill = selected ? 0xffe08a : 0x000000;
            const fillAlpha = selected ? 0.9 : 0.35;
            const stroke = selected ? 0xffffff : 0x000000;
            const strokeAlpha = selected ? 0.9 : 0.4;

            button.background.setFillStyle(fill, fillAlpha);
            button.background.setStrokeStyle(2, stroke, strokeAlpha);
            button.icon.setAlpha(selected ? 1 : 0.7);
            button.label.setColor(selected ? '#1b1b1b' : '#ffffff');
            button.label.setAlpha(selected ? 1 : 0.85);
        }
    }

    private getActiveCursorSpec() {
        return this.selectedObject === 'plank' ? this.plankCursorSpec : this.ballCursorSpec;
    }

    private getCursorPosition(spec: CursorSpec) {
        return { x: this.platformCenterX + spec.dx, y: this.surfaceY + spec.dy };
    }

    private rebuildGhost() {
        this.cursorGhost?.destroy();
        const spec = this.getActiveCursorSpec();
        const { x, y } = this.getCursorPosition(spec);

        if (this.selectedObject === 'plank') {
            this.cursorGhost = createPlankGhost(this, x, y, spec.w, spec.h);
        } else {
            this.cursorGhost = createBallGhost(this, x, y, spec.w / 2);
        }

        this.cursorGhost.setAlpha(0.5).setDepth(200);
        this.cursorGhost.setVisible(this.mode === 'PAUSED');
    }

    private syncGhostPosition() {
        if (!this.cursorGhost) return;
        const spec = this.getActiveCursorSpec();
        const { x, y } = this.getCursorPosition(spec);
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

    private snapCursor(spec: CursorSpec, type: BuilderObjectType) {
        if (type === 'ball') {
            spec.dx = this.gridSnap(spec.dx);
            spec.dy = this.gridSnap(spec.dy);
            return;
        }

        spec.dx = this.snapDx(spec.dx, spec.w);
        spec.dy = this.snapDy(spec.dy, spec.h);
    }

    private snapDx(dx: number, w: number) {
        const leftEdge = dx - w / 2;
        const snappedLeft = this.gridSnap(leftEdge);
        return snappedLeft + w / 2;
    }

    private moveCursor(dx: number, dy: number) {
        const spec = this.getActiveCursorSpec();
        spec.dx += dx;
        spec.dy += dy;
        this.snapCursor(spec, this.selectedObject);
        this.syncGhostPosition();
    }

    private rotateCursor() {
        const spec = this.plankCursorSpec;
        const bottomRelative = spec.dy + spec.h / 2;
        const leftEdge = spec.dx - spec.w / 2;
        const currentLength = Math.max(spec.w, spec.h);
        this.cursorOrientation = this.cursorOrientation === 'vertical' ? 'horizontal' : 'vertical';
        if (this.cursorOrientation === 'horizontal') {
            spec.w = currentLength;
            spec.h = PLANK_WIDTH;
        } else {
            spec.w = PLANK_WIDTH;
            spec.h = currentLength;
        }
        spec.dy = bottomRelative - spec.h / 2;
        spec.dx = leftEdge + spec.w / 2;
        this.snapCursor(spec, 'plank');
        this.rebuildGhost();
    }

    private adjustLength(delta: number) {
        const spec = this.plankCursorSpec;
        const currentLength = Math.max(spec.w, spec.h);
        const nextLength = Math.max(PLANK_WIDTH, currentLength + delta);
        if (nextLength === currentLength) return;

        const bottomRelative = spec.dy + spec.h / 2;
        const leftEdge = spec.dx - spec.w / 2;

        if (this.cursorOrientation === 'horizontal') {
            spec.w = nextLength;
            spec.h = PLANK_WIDTH;
            spec.dx = leftEdge + spec.w / 2;
        } else {
            spec.w = PLANK_WIDTH;
            spec.h = nextLength;
        }

        spec.dy = bottomRelative - spec.h / 2;
        this.snapCursor(spec, 'plank');
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

    private placeSelectedObject() {
        if (this.selectedObject === 'ball') {
            this.placeBall();
            return;
        }

        this.placePlank();
    }

    private placePlank() {
        if (this.mode !== 'PAUSED') return;
        const spec = this.plankCursorSpec;
        const placedSpec: PlankSpec = {
            type: 'plank',
            dx: spec.dx,
            dy: spec.dy,
            w: spec.w,
            h: spec.h
        };

        this.addPlacedPlank(placedSpec);
    }

    private placeBall() {
        if (this.mode !== 'PAUSED') return;
        const spec = this.ballCursorSpec;
        const radius = spec.w / 2;
        const placedSpec: BallSpec = {
            type: 'ball',
            dx: spec.dx,
            dy: spec.dy,
            r: radius
        };

        this.addPlacedBall(placedSpec);
    }

    private addPlacedPlank(spec: PlankSpec) {
        const x = this.platformCenterX + spec.dx;
        const y = this.surfaceY + spec.dy;

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
            spec.w,
            spec.h,
            false,
            RAPIER.RigidBodyType.Fixed
        );

        rect.setDepth(150);
        rect.setInteractive(new Phaser.Geom.Rectangle(-spec.w / 2, -spec.h / 2, spec.w, spec.h), Phaser.Geom.Rectangle.Contains);

        const id = `object-${this.objectIdCounter++}`;
        this.placed.push({ id, spec, container: rect, body });
        rect.on('pointerdown', () => this.removePlaced(id));
    }

    private addPlacedBall(spec: BallSpec) {
        const x = this.platformCenterX + spec.dx;
        const y = this.surfaceY + spec.dy;

        const objects: Trackable[] = [];
        const bodies: RapierBody[] = [];
        const { sprite, body } = createBall(
            {
                scene: this,
                rapier: this.rapier,
                trackObject: this.trackObject
            },
            objects,
            bodies,
            x,
            y,
            spec.r,
            RAPIER.RigidBodyType.Fixed
        );

        sprite.setDepth(150);
        sprite.setInteractive({ useHandCursor: true });

        const id = `object-${this.objectIdCounter++}`;
        this.placed.push({ id, spec, container: sprite, body });
        sprite.on('pointerdown', () => this.removePlaced(id));
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

    private clearPlaced() {
        for (const entry of this.placed) {
            this.rapier.destroy(entry.container);
        }
        this.placed.length = 0;
    }

    private promptLoadJson() {
        if (!this.loadInput) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.style.position = 'fixed';
            input.style.left = '-9999px';
            input.addEventListener('change', () => {
                void this.handleLoadFile();
            });
            document.body.appendChild(input);
            this.loadInput = input;
        }

        this.loadInput.value = '';
        this.loadInput.click();
    }

    private async handleLoadFile() {
        const file = this.loadInput?.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            this.loadFromJson(text, file.name);
        } catch (error) {
            console.error('Failed to read tower spec file.', error);
        }
    }

    private loadFromJson(raw: string, filename?: string) {
        let data: { parts?: Array<Record<string, unknown>> };
        try {
            data = JSON.parse(raw) as { parts?: Array<Record<string, unknown>> };
        } catch (error) {
            console.error('Invalid JSON in tower spec.', error);
            return;
        }

        if (!Array.isArray(data.parts)) {
            console.error('Tower spec missing parts array.', { filename });
            return;
        }

        this.setMode('PAUSED');
        this.clearPlaced();
        this.objectIdCounter = 0;

        for (const rawPart of data.parts) {
            this.addPlacedFromSpec(rawPart);
        }
    }

    private addPlacedFromSpec(rawPart: Record<string, unknown>) {
        const dx = rawPart.dx;
        const dy = rawPart.dy;
        if (typeof dx !== 'number' || typeof dy !== 'number') {
            console.warn('Skipping part with missing dx/dy', rawPart);
            return;
        }

        const typeValue = rawPart.type;
        const resolvedType: BuilderObjectType =
            typeValue === 'ball' ? 'ball' : typeValue === 'plank' ? 'plank' : 'r' in rawPart ? 'ball' : 'plank';

        if (resolvedType === 'ball') {
            const radiusValue = rawPart.r;
            const radius = typeof radiusValue === 'number' ? radiusValue : BUILDER_BALL_RADIUS;
            const spec: BallSpec = { type: 'ball', dx, dy, r: radius };
            this.addPlacedBall(spec);
            return;
        }

        const wValue = rawPart.w;
        const hValue = rawPart.h;
        const w = typeof wValue === 'number' ? wValue : PLANK_WIDTH;
        const h = typeof hValue === 'number' ? hValue : PLANK_LENGTH;
        const spec: PlankSpec = { type: 'plank', dx, dy, w, h };
        this.addPlacedPlank(spec);
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
