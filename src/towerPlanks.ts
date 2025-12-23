import type Phaser from 'phaser';
import { RAPIER } from './physics';
import { PLANK_DENSITY } from './config';
import type { RapierBody, RapierPhysics } from './physics';

export type Trackable = Phaser.GameObjects.GameObject & { getBounds: () => Phaser.Geom.Rectangle };

export type PlankContext = {
    scene: Phaser.Scene;
    rapier: RapierPhysics;
    trackObject: (obj: Trackable, includeInBounds?: boolean) => void;
};

export type PlankVisuals = {
    normal: Phaser.GameObjects.GameObject;
    frozen: Phaser.GameObjects.GameObject;
};

const PLANK_FRICTION = 0.5;
const PLANK_RESTITUTION = 0.05;
const PLANK_TEXTURE_NORMAL = 'log1';
const PLANK_TEXTURE_FROZEN = 'log_frozen';

function clampThreeSliceMargins(targetW: number, left: number, right: number) {
    const maxX = Math.max(1, Math.floor(targetW / 2) - 1);
    return { left: Math.min(left, maxX), right: Math.min(right, maxX) };
}

function buildPlankContainer(
    scene: Phaser.Scene,
    x: number,
    y: number,
    w: number,
    h: number,
    isFrozen: boolean
) {
    const container = scene.add.container(x, y);
    container.setSize(w, h);

    // NineSlice expects to stretch the center while keeping the ends crisp.
    // Our source art is horizontal; for tall planks we create it "sideways" and rotate the child.
    const isTall = h > w;
    const renderW = isTall ? h : w;
    const renderH = isTall ? w : h;

    // These are in texture pixels and then clamped so short planks don't break the 3-slice.
    const slice = clampThreeSliceMargins(renderW, 5, 10);

    const buildSprite = (textureKey: string) => {
        // Stretch length using 3-slice (left/middle/right), but stretch thickness by scaling the whole sprite.
        // This keeps the "ends" crisp lengthways while allowing the log to get fatter/thinner naturally.
        const source = scene.textures.get(textureKey).getSourceImage() as unknown as {
            width: number;
            height: number;
        };
        const baseH = Math.max(1, source?.height ?? renderH);
        const thicknessScale = renderH / baseH;

        const sprite = scene.add
            // 3-slice: omit top/bottom margins so only length is sliced.
            .nineslice(0, 0, textureKey, undefined, renderW, baseH, slice.left, slice.right)
            .setOrigin(0.5, 0.5);

        sprite.setScale(1, thicknessScale);
        if (isTall) sprite.setRotation(Math.PI / 2);

        return sprite as Phaser.GameObjects.GameObject;
    };

    const normalSprite = buildSprite(PLANK_TEXTURE_NORMAL);
    const frozenSprite = buildSprite(PLANK_TEXTURE_FROZEN);
    normalSprite.setVisible(!isFrozen);
    frozenSprite.setVisible(isFrozen);

    container.add([normalSprite, frozenSprite]);

    return {
        container,
        visuals: {
            normal: normalSprite,
            frozen: frozenSprite
        }
    };
}

export function createPlank(
    ctx: PlankContext,
    objects: Trackable[],
    bodies: RapierBody[],
    visuals: PlankVisuals[],
    x: number,
    y: number,
    w: number,
    h: number,
    isFrozen = true,
    bodyType = RAPIER.RigidBodyType.Fixed
) {
    // Keep physics unrotated; rotate only the child sprite for visuals.
    const { container, visuals: plankVisuals } = buildPlankContainer(ctx.scene, x, y, w, h, isFrozen);
    visuals.push(plankVisuals);

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

export function createPlankGhost(
    scene: Phaser.Scene,
    x: number,
    y: number,
    w: number,
    h: number
) {
    return buildPlankContainer(scene, x, y, w, h, false).container;
}
