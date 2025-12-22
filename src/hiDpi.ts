import type Phaser from 'phaser';

export function applyHiDpi(scale: Phaser.Scale.ScaleManager, dpr = window.devicePixelRatio || 1) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelWidth = Math.max(1, Math.floor(width * dpr));
    const pixelHeight = Math.max(1, Math.floor(height * dpr));

    scale.setZoom(1 / dpr);
    scale.resize(pixelWidth, pixelHeight);

    return { dpr, width, height, pixelWidth, pixelHeight };
}
