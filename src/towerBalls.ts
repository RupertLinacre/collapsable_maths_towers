import type Phaser from 'phaser';
import { RAPIER } from './physics';
import type { RapierBody, RapierPhysics } from './physics';
import type { Trackable } from './towerPlanks';

export type BallContext = {
    scene: Phaser.Scene;
    rapier: RapierPhysics;
    trackObject: (obj: Trackable, includeInBounds?: boolean) => void;
};

const BALL_TEXTURE_KEY = 'ball_happy';
const BALL_FRICTION = 0.6;
const BALL_RESTITUTION = 0.25;
const BALL_DENSITY = 1.0;

export function createBall(
    ctx: BallContext,
    objects: Trackable[],
    bodies: RapierBody[],
    x: number,
    y: number,
    radius: number,
    bodyType = RAPIER.RigidBodyType.Fixed
) {
    const sprite = ctx.scene.add.image(x, y, BALL_TEXTURE_KEY);
    sprite.setDisplaySize(radius * 2, radius * 2);

    const body = ctx.rapier.addRigidBody(sprite, {
        rigidBodyType: bodyType,
        collider: RAPIER.ColliderDesc.ball(radius)
    });

    body.collider.setFriction(BALL_FRICTION);
    body.collider.setRestitution(BALL_RESTITUTION);
    body.collider.setDensity(BALL_DENSITY);
    body.rigidBody.setTranslation({ x, y }, true);

    ctx.trackObject(sprite as unknown as Trackable, true);

    objects.push(sprite as unknown as Trackable);
    bodies.push(body);

    return { sprite, body };
}

export function createBallGhost(scene: Phaser.Scene, x: number, y: number, radius: number) {
    const sprite = scene.add.image(x, y, BALL_TEXTURE_KEY);
    sprite.setDisplaySize(radius * 2, radius * 2);
    return sprite;
}
