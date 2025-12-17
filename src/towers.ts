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
const PLANK_DENSITY = 10.0;

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
    color = 0xffd700,
    bodyType = RAPIER.RigidBodyType.Fixed
) {
    const rect = ctx.scene.add.rectangle(x, y, w, h, color);

    const body = ctx.rapier.addRigidBody(rect, {
        rigidBodyType: bodyType,
        collider: RAPIER.ColliderDesc.cuboid(w / 2, h / 2)
    });

    body.collider.setFriction(PLANK_FRICTION);
    body.collider.setRestitution(PLANK_RESTITUTION);
    body.collider.setDensity(PLANK_DENSITY);
    body.rigidBody.setTranslation({ x, y }, true);

    ctx.trackObject(rect as Trackable, true);

    objects.push(rect as Trackable);
    bodies.push(body);

    return { rect, body };
}

const single: TowerDefinition = {
    id: 'single',
    spawn: (ctx) => {
        const objects: Trackable[] = [];
        const bodies: RapierBody[] = [];

        const w = PLANK_WIDTH;
        const h = PLANK_LENGTH;

        createPlank(ctx, objects, bodies, ctx.x, ctx.surfaceY - h / 2, w, h);

        return { objects, enableDynamics: () => enableBodiesDynamic(bodies) };
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

        return { objects, enableDynamics: () => enableBodiesDynamic(bodies) };
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

        return { objects, enableDynamics: () => enableBodiesDynamic(bodies) };
    }
};

export const TOWER_LIBRARY: TowerDefinition[] = [single, stack2, arch];
