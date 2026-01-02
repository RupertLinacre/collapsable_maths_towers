import type Phaser from 'phaser';
import { RAPIER } from './physics';
import type { RapierBody, RapierPhysics } from './physics';
import type { Trackable } from './towerPlanks';

const towerBallModules = import.meta.glob('./assets/images/balls/tower_balls/*/ball_*.png', {
    eager: true,
    query: '?as=url',
    import: 'default'
}) as Record<string, string>;

const TOWER_BALL_PATH_RE = /\/tower_balls\/([^/]+)\/ball_([^/.]+)\.png$/;

const BALL_TEXTURE_KEYS: Record<string, Record<string, string>> = {};
const BALL_TEXTURE_URLS: Record<string, Record<string, string>> = {};
const BALL_PEOPLE: string[] = [];

for (const [path, url] of Object.entries(towerBallModules)) {
    const match = path.match(TOWER_BALL_PATH_RE);
    if (!match) continue;
    const [, person, mood] = match;
    if (!BALL_TEXTURE_KEYS[person]) {
        BALL_TEXTURE_KEYS[person] = {};
        BALL_TEXTURE_URLS[person] = {};
        BALL_PEOPLE.push(person);
    }
    BALL_TEXTURE_KEYS[person][mood] = `ball_${person}_${mood}`;
    BALL_TEXTURE_URLS[person][mood] = url;
}

if (BALL_PEOPLE.length === 0) {
    throw new Error('No tower ball assets found in src/assets/images/balls/tower_balls');
}

export type BallPerson = string;
export type BallMood = 'happy' | 'surprised' | 'grumpy' | 'laughing';

export type TowerBall = {
    sprite: Phaser.GameObjects.Image;
    body: RapierBody;
    radius: number;
    person: BallPerson;
    mood: BallMood;
    hasBeenHit: boolean;
    hasHitFloor: boolean;
    isDown: boolean;
};

export type BallContext = {
    scene: Phaser.Scene;
    rapier: RapierPhysics;
    trackObject: (obj: Trackable, includeInBounds?: boolean) => void;
};

const DEFAULT_BALL_MOOD: BallMood = 'happy';
const DEFAULT_BALL_PERSON = BALL_PEOPLE[0];

export const BALL_PREVIEW_TEXTURE_KEY =
    DEFAULT_BALL_PERSON && BALL_TEXTURE_KEYS[DEFAULT_BALL_PERSON]?.[DEFAULT_BALL_MOOD]
        ? BALL_TEXTURE_KEYS[DEFAULT_BALL_PERSON][DEFAULT_BALL_MOOD]
        : 'ball_preview';

const BALL_FRICTION = 0.6;
const BALL_RESTITUTION = 0.25;
const BALL_DENSITY = 1.0;

function getBallTextureKey(person: BallPerson, mood: BallMood) {
    const personKeys = BALL_TEXTURE_KEYS[person];
    if (!personKeys) return BALL_PREVIEW_TEXTURE_KEY;
    return personKeys[mood] ?? personKeys[DEFAULT_BALL_MOOD] ?? BALL_PREVIEW_TEXTURE_KEY;
}

function pickRandomPerson(): BallPerson {
    const count = BALL_PEOPLE.length;
    return BALL_PEOPLE[Math.floor(Math.random() * count)];
}

export function preloadTowerBallTextures(scene: Phaser.Scene) {
    for (const person of Object.keys(BALL_TEXTURE_URLS)) {
        const moods = BALL_TEXTURE_URLS[person];
        for (const [mood, url] of Object.entries(moods)) {
            scene.load.image(BALL_TEXTURE_KEYS[person][mood], url);
        }
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
        hasHitFloor: false,
        isDown: false
    } satisfies TowerBall;
}

export function createBallGhost(scene: Phaser.Scene, x: number, y: number, radius: number) {
    const sprite = scene.add.image(x, y, BALL_PREVIEW_TEXTURE_KEY);
    sprite.setDisplaySize(radius * 2, radius * 2);
    return sprite;
}
