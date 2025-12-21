import type Phaser from 'phaser';
import { RAPIER } from './physics';
import type { RapierBody, RapierPhysics } from './physics';
import { createPlank, type PlankVisuals, type Trackable } from './towerPlanks';
import { createBall } from './towerBalls';

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
    ballBodies?: RapierBody[];

    enableDynamics?: () => void; // e.g. Fixed → Dynamic on launch
    setFrozenVisual?: (frozen: boolean) => void;
    step?: () => void; // e.g. grow one step
    getTopSpawn?: () => { x: number; y: number } | null;
    destroy?: () => void;
}

export interface TowerDefinition {
    id: string;
    weight?: number; // optional; unused for now (uniform random)
    spawn: (ctx: TowerSpawnContext) => TowerInstance;
}

export type TowerSpecPart =
    | {
          type?: 'plank';
          dx: number;
          dy: number;
          w: number;
          h: number;
      }
    | {
          type: 'ball';
          dx: number;
          dy: number;
          r: number;
      };

export type TowerSpecFile = {
    id: string;
    parts: TowerSpecPart[];
};

function enableBodiesDynamic(bodies: RapierBody[]) {
    for (const body of bodies) {
        body.rigidBody.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        body.rigidBody.wakeUp();
    }
}

const towerSpecModules = import.meta.glob('./assets/towerspecs/*.json', { eager: true }) as Record<
    string,
    { default: TowerSpecFile }
>;

function buildTowerDefinition(spec: TowerSpecFile): TowerDefinition {
    return {
        id: spec.id,
        spawn: (ctx) => {
            const objects: Trackable[] = [];
            const bodies: RapierBody[] = [];
            const visuals: PlankVisuals[] = [];
            const ballBodies: RapierBody[] = [];

            for (const part of spec.parts) {
                if (part.type === 'ball') {
                    const { body } = createBall(
                        ctx,
                        objects,
                        bodies,
                        ctx.x + part.dx,
                        ctx.surfaceY + part.dy,
                        part.r
                    );
                    ballBodies.push(body);
                    continue;
                }

                createPlank(
                    ctx,
                    objects,
                    bodies,
                    visuals,
                    ctx.x + part.dx,
                    ctx.surfaceY + part.dy,
                    part.w,
                    part.h
                );
            }

            return {
                objects,
                bodies,
                ballBodies,
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
}

export const TOWER_LIBRARY: TowerDefinition[] = Object.values(towerSpecModules).map((mod) =>
    buildTowerDefinition(mod.default)
);
