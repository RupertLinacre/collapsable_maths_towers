import type Phaser from 'phaser';
import { RAPIER } from './physics';
import type { RapierBody, RapierPhysics } from './physics';
import { PLANK_LENGTH, PLANK_WIDTH } from './config';

export type Trackable = Phaser.GameObjects.GameObject & { getBounds: () => Phaser.Geom.Rectangle };

export interface TowerSpawnContext {
    scene: Phaser.Scene;
    rapier: RapierPhysics;

    // Anchor point: platform center X and platform top surface Y.
    x: number;
    surfaceY: number;

    // Allow towers (including procedural builders) to register objects for camera tracking.
    trackObject: (obj: Trackable, includeInBounds?: boolean) => void;
}

export interface TowerInstance {
    objects: Trackable[];
    bodies: RapierBody[];

    enableDynamics?: () => void; // e.g. Fixed → Dynamic on launch
    step?: () => void; // e.g. grow one step
    getTopSpawn?: () => { x: number; y: number } | null;
    destroy?: () => void;
}

export interface TowerDefinition {
    id: 'single' | 'stack2' | 'arch';
    weight?: number; // optional; unused for now (uniform random)
    spawn: (ctx: TowerSpawnContext) => TowerInstance;
}

const EPS = 2;

const PLANK_FRICTION = 0.7;
const PLANK_RESTITUTION = 0.05;
const PLANK_DENSITY = 1.0;

function clampThreeSliceMargins(targetW: number, left: number, right: number) {
    const maxX = Math.max(1, Math.floor(targetW / 2) - 1);
    return { left: Math.min(left, maxX), right: Math.min(right, maxX) };
}

function enableBodiesDynamic(bodies: RapierBody[]) {
    for (const body of bodies) {
        body.rigidBody.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        body.rigidBody.wakeUp();
    }
}

function createPlank(
    ctx: TowerSpawnContext,
    objects: Trackable[],
    bodies: RapierBody[],
    x: number,
    y: number,
    w: number,
    h: number,
    bodyType = RAPIER.RigidBodyType.Fixed
) {
    // Keep physics unrotated; rotate only the child sprite for visuals.
    const container = ctx.scene.add.container(x, y);
    container.setSize(w, h);

    // NineSlice expects to stretch the center while keeping the ends crisp.
    // Our source art is horizontal; for tall planks we create it "sideways" and rotate the child.
    const isTall = h > w;
    const renderW = isTall ? h : w;
    const renderH = isTall ? w : h;

    // Stretch length using 3-slice (left/middle/right), but stretch thickness by scaling the whole sprite.
    // This keeps the "ends" crisp lengthways while allowing the log to get fatter/thinner naturally.
    const source = ctx.scene.textures.get('log1').getSourceImage() as unknown as { width: number; height: number };
    const baseH = Math.max(1, source?.height ?? renderH);
    const thicknessScale = renderH / baseH;

    // These are in texture pixels and then clamped so short planks don't break the 3-slice.
    const slice = clampThreeSliceMargins(renderW, 5, 10);

    const sprite = ctx.scene.add
        // 3-slice: omit top/bottom margins so only length is sliced.
        .nineslice(0, 0, 'log1', undefined, renderW, baseH, slice.left, slice.right)
        .setOrigin(0.5, 0.5);

    sprite.setScale(1, thicknessScale);
    if (isTall) sprite.setRotation(Math.PI / 2);

    container.add(sprite);

    const body = ctx.rapier.addRigidBody(container, {
        rigidBodyType: bodyType,
        collider: RAPIER.ColliderDesc.cuboid(w / 2, h / 2)
    });

    body.collider.setFriction(PLANK_FRICTION);
    body.collider.setRestitution(PLANK_RESTITUTION);
    body.collider.setDensity(PLANK_DENSITY);
    body.rigidBody.setTranslation({ x, y }, true);

    ctx.trackObject(container as unknown as Trackable, true);

    objects.push(container as unknown as Trackable);
    bodies.push(body);

    return { rect: container, body };
}

const single: TowerDefinition = {
    id: 'single',
    spawn: (ctx) => {
        const objects: Trackable[] = [];
        const bodies: RapierBody[] = [];

        const w = PLANK_WIDTH;
        const h = PLANK_LENGTH;

        createPlank(ctx, objects, bodies, ctx.x, ctx.surfaceY - h / 2, w, h);

        return { objects, bodies, enableDynamics: () => enableBodiesDynamic(bodies) };
    }
};

const stack2: TowerDefinition = {
    id: 'stack2',
    spawn: (ctx) => {
        const objects: Trackable[] = [];
        const bodies: RapierBody[] = [];

        const w = PLANK_WIDTH;
        const h = PLANK_LENGTH;

        createPlank(ctx, objects, bodies, ctx.x, ctx.surfaceY - h / 2, w, h);
        createPlank(ctx, objects, bodies, ctx.x, ctx.surfaceY - h - h / 2 - EPS, w, h);

        return { objects, bodies, enableDynamics: () => enableBodiesDynamic(bodies) };
    }
};

const arch: TowerDefinition = {
    id: 'arch',
    spawn: (ctx) => {
        const objects: Trackable[] = [];
        const bodies: RapierBody[] = [];

        const pillarW = PLANK_WIDTH;
        const pillarH = PLANK_LENGTH;
        const pillarOffsetX = PLANK_LENGTH / 2 - PLANK_WIDTH / 2;

        createPlank(ctx, objects, bodies, ctx.x - pillarOffsetX, ctx.surfaceY - pillarH / 2, pillarW, pillarH);
        createPlank(ctx, objects, bodies, ctx.x + pillarOffsetX, ctx.surfaceY - pillarH / 2, pillarW, pillarH);

        const lintelW = PLANK_LENGTH;
        const lintelH = PLANK_WIDTH;
        createPlank(ctx, objects, bodies, ctx.x, ctx.surfaceY - pillarH - lintelH / 2 - EPS, lintelW, lintelH);

        return { objects, bodies, enableDynamics: () => enableBodiesDynamic(bodies) };
    }
};

export const TOWER_LIBRARY: TowerDefinition[] = [single, stack2, arch];
