import type Phaser from 'phaser';
import { RAPIER, createRapierPhysics } from './physics';
import { DEBUG_RAPIER, GRAVITY_MULTIPLIER } from './config';
import type { RapierPhysics } from './physics';

const SOLVER_ITERATIONS = 20;
const ALLOWED_LINEAR_ERROR = 0.001;
const LENGTH_UNIT = 1;

export const GRAVITY_Y = 9.81 * GRAVITY_MULTIPLIER; // 100 pixels = 1 meter

export function configureRapierWorld(world: RAPIER.World) {
    world.integrationParameters.numSolverIterations = SOLVER_ITERATIONS;
    world.integrationParameters.normalizedAllowedLinearError = ALLOWED_LINEAR_ERROR;
    world.integrationParameters.lengthUnit = LENGTH_UNIT;

}

export function assertWorldConfigured(world: RAPIER.World) {
    const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;
    if (world.integrationParameters.numSolverIterations !== SOLVER_ITERATIONS) {
        throw new Error('Rapier world solver iterations do not match expected settings.');
    }
    if (!near(world.integrationParameters.normalizedAllowedLinearError, ALLOWED_LINEAR_ERROR)) {
        throw new Error('Rapier world allowed linear error does not match expected settings.');
    }
    if (!near(world.integrationParameters.lengthUnit, LENGTH_UNIT)) {
        throw new Error('Rapier world length unit does not match expected settings.');
    }
}

export function createConfiguredRapier(scene: Phaser.Scene, debug = DEBUG_RAPIER): RapierPhysics {
    const gravity = { x: 0, y: GRAVITY_Y };
    const rapier = createRapierPhysics(gravity, scene);
    configureRapierWorld(rapier.getWorld());

    if (debug) rapier.debugger(true);

    return rapier;
}
