import type Phaser from 'phaser';
import { RAPIER } from './physics';
import type { RapierBody, RapierPhysics } from './physics';
import { PLANK_LENGTH, PLANK_WIDTH } from './config';
import { createPlank, type PlankVisuals, type Trackable } from './towerPlanks';

export type { Trackable } from './towerPlanks';

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
    setFrozenVisual?: (frozen: boolean) => void;
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

function enableBodiesDynamic(bodies: RapierBody[]) {
    for (const body of bodies) {
        body.rigidBody.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        body.rigidBody.wakeUp();
    }
}

const single: TowerDefinition = {
    id: 'single',
    spawn: (ctx) => {
        const objects: Trackable[] = [];
        const bodies: RapierBody[] = [];
        const visuals: PlankVisuals[] = [];

        const w = PLANK_WIDTH;
        const h = PLANK_LENGTH;

        createPlank(ctx, objects, bodies, visuals, ctx.x, ctx.surfaceY - h / 2, w, h);

        return {
            objects,
            bodies,
            enableDynamics: () => enableBodiesDynamic(bodies),
            setFrozenVisual: (frozen) => {
                for (const visual of visuals) {
                    visual.frozen.setVisible(frozen);
                    visual.normal.setVisible(!frozen);
                }
            }
        };
    }
};

const stack2: TowerDefinition = {
    id: 'stack2',
    spawn: (ctx) => {
        const objects: Trackable[] = [];
        const bodies: RapierBody[] = [];
        const visuals: PlankVisuals[] = [];

        const w = PLANK_WIDTH;
        const h = PLANK_LENGTH;

        createPlank(ctx, objects, bodies, visuals, ctx.x, ctx.surfaceY - h / 2, w, h);
        createPlank(ctx, objects, bodies, visuals, ctx.x, ctx.surfaceY - h - h / 2 - EPS, w, h);

        return {
            objects,
            bodies,
            enableDynamics: () => enableBodiesDynamic(bodies),
            setFrozenVisual: (frozen) => {
                for (const visual of visuals) {
                    visual.frozen.setVisible(frozen);
                    visual.normal.setVisible(!frozen);
                }
            }
        };
    }
};

const arch: TowerDefinition = {
    id: 'arch',
    spawn: (ctx) => {
        const objects: Trackable[] = [];
        const bodies: RapierBody[] = [];
        const visuals: PlankVisuals[] = [];

        const pillarW = PLANK_WIDTH;
        const pillarH = PLANK_LENGTH;
        const pillarOffsetX = PLANK_LENGTH / 2 - PLANK_WIDTH / 2;

        createPlank(
            ctx,
            objects,
            bodies,
            visuals,
            ctx.x - pillarOffsetX,
            ctx.surfaceY - pillarH / 2,
            pillarW,
            pillarH
        );
        createPlank(
            ctx,
            objects,
            bodies,
            visuals,
            ctx.x + pillarOffsetX,
            ctx.surfaceY - pillarH / 2,
            pillarW,
            pillarH
        );

        const lintelW = PLANK_LENGTH;
        const lintelH = PLANK_WIDTH;
        createPlank(
            ctx,
            objects,
            bodies,
            visuals,
            ctx.x,
            ctx.surfaceY - pillarH - lintelH / 2 - EPS,
            lintelW,
            lintelH
        );

        return {
            objects,
            bodies,
            enableDynamics: () => enableBodiesDynamic(bodies),
            setFrozenVisual: (frozen) => {
                for (const visual of visuals) {
                    visual.frozen.setVisible(frozen);
                    visual.normal.setVisible(!frozen);
                }
            }
        };
    }
};

export const TOWER_LIBRARY: TowerDefinition[] = [single, stack2, arch];
