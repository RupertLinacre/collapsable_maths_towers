export const LEVEL_PLATFORM_COUNT: number = 15
// Fraction (0..1) of the trajectory to leave empty before placing platforms.
// Example: 0.5 starts placement at the apex; 0.33 starts after the first third.
export const LEVEL_PLATFORM_GAP_FRACTION: number = 0.1;

// Vertical distance from the floor to the catapult/origin point.
export const CATAPULT_HEIGHT_ABOVE_FLOOR = 50;

// "Perfect shot" controls the reference trajectory (platform layout) and the initial aim.
// Increase power to make the parabola wider (platforms further away).
export const PERFECT_SHOT_ANGLE_DEG: number = -55;
export const PERFECT_SHOT_POWER: number = 2000;

export const AIM_ANGLE_MIN_DEG = -90;
export const AIM_ANGLE_MAX_DEG = 0;
export const AIM_POWER_MIN = 100;
// Max launch power the player can select (keep >= PERFECT_SHOT_POWER).
export const AIM_POWER_MAX = 10000;

export const PLATFORM_WIDTH = 200;
export const PLATFORM_HEIGHT = 10;

// Vertical distance from the parabola point to the platform's top surface.
export const PLATFORM_PARABOLA_Y_OFFSET = PLATFORM_WIDTH / 2;

// --- Tower / Plank Configuration ---
// Standard “building block” dimensions used by tower library.
export const PLANK_WIDTH = 20; // thickness
export const PLANK_LENGTH = 120; // long side (equal for all planks)

// --- Debug ---
export const DEBUG_RAPIER = false; // physics wireframes
export const DEBUG_BOUNDS = false; // Phaser object AABBs
