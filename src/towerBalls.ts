import type Phaser from 'phaser';
import { RAPIER } from './physics';
import type { RapierBody, RapierPhysics } from './physics';
import type { Trackable } from './towerPlanks';
import ballDadHappyUrl from './assets/images/balls/dad/ball_happy.png?as=url';
import ballDadSurprisedUrl from './assets/images/balls/dad/ball_surprised.png?as=url';
import ballDadAngryUrl from './assets/images/balls/dad/ball_angry.png?as=url';
import ballMumHappyUrl from './assets/images/balls/mum/mum_happy.png?as=url';
import ballMumSurprisedUrl from './assets/images/balls/mum/ball_surprised.png?as=url';
import ballMumAngryUrl from './assets/images/balls/mum/ball_angry.png?as=url';

export type BallPerson = 'dad' | 'mum';
export type BallMood = 'happy' | 'surprised' | 'angry';

export type TowerBall = {
    sprite: Phaser.GameObjects.Image;
    body: RapierBody;
    radius: number;
    person: BallPerson;
    mood: BallMood;
    hasBeenHit: boolean;
    hasHitFloor: boolean;
};

export type BallContext = {
    scene: Phaser.Scene;
    rapier: RapierPhysics;
    trackObject: (obj: Trackable, includeInBounds?: boolean) => void;
};

const BALL_TEXTURE_KEYS: Record<BallPerson, Record<BallMood, string>> = {
    dad: {
        happy: 'ball_dad_happy',
        surprised: 'ball_dad_surprised',
        angry: 'ball_dad_angry'
    },
    mum: {
        happy: 'ball_mum_happy',
        surprised: 'ball_mum_surprised',
        angry: 'ball_mum_angry'
    }
};

const BALL_TEXTURE_URLS: Record<BallPerson, Record<BallMood, string>> = {
    dad: {
        happy: ballDadHappyUrl,
        surprised: ballDadSurprisedUrl,
        angry: ballDadAngryUrl
    },
    mum: {
        happy: ballMumHappyUrl,
        surprised: ballMumSurprisedUrl,
        angry: ballMumAngryUrl
    }
};

export const BALL_PREVIEW_TEXTURE_KEY = BALL_TEXTURE_KEYS.dad.happy;

const BALL_FRICTION = 0.6;
const BALL_RESTITUTION = 0.25;
const BALL_DENSITY = 1.0;

function getBallTextureKey(person: BallPerson, mood: BallMood) {
    return BALL_TEXTURE_KEYS[person][mood];
}

function pickRandomPerson(): BallPerson {
    return Math.random() < 0.5 ? 'dad' : 'mum';
}

export function preloadTowerBallTextures(scene: Phaser.Scene) {
    for (const person of Object.keys(BALL_TEXTURE_URLS) as BallPerson[]) {
        const moods = BALL_TEXTURE_URLS[person];
        scene.load.image(BALL_TEXTURE_KEYS[person].happy, moods.happy);
        scene.load.image(BALL_TEXTURE_KEYS[person].surprised, moods.surprised);
        scene.load.image(BALL_TEXTURE_KEYS[person].angry, moods.angry);
    }
}

export function setBallMood(ball: TowerBall, mood: BallMood) {
    if (ball.mood === mood) return;
    ball.mood = mood;
    ball.sprite.setTexture(getBallTextureKey(ball.person, mood));
}

export function createBall(
    ctx: BallContext,
    objects: Trackable[],
    bodies: RapierBody[],
    x: number,
    y: number,
    radius: number,
    bodyType = RAPIER.RigidBodyType.Fixed
) {
    const person = pickRandomPerson();
    const mood: BallMood = 'happy';
    const sprite = ctx.scene.add.image(x, y, getBallTextureKey(person, mood));
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

    return {
        sprite,
        body,
        radius,
        person,
        mood,
        hasBeenHit: false,
        hasHitFloor: false
    } satisfies TowerBall;
}

export function createBallGhost(scene: Phaser.Scene, x: number, y: number, radius: number) {
    const sprite = scene.add.image(x, y, BALL_PREVIEW_TEXTURE_KEY);
    sprite.setDisplaySize(radius * 2, radius * 2);
    return sprite;
}
