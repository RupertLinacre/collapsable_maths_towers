export const LEVEL_PLATFORM_COUNT: number = 20;
// Fraction (0..1) of the trajectory to leave empty before placing platforms.
// Example: 0.5 starts placement at the apex; 0.33 starts after the first third.
export const LEVEL_PLATFORM_GAP_FRACTION: number = 0.33;

// Vertical distance from the floor to the catapult/origin point.
export const CATAPULT_HEIGHT_ABOVE_FLOOR = 50;

// "Perfect shot" controls the reference trajectory (platform layout) and the initial aim.
// Increase power to make the parabola wider (platforms further away).
export const PERFECT_SHOT_ANGLE_DEG: number = -55;
export const PERFECT_SHOT_POWER: number = 2100;

export const AIM_ANGLE_MIN_DEG = -90;
export const AIM_ANGLE_MAX_DEG = 0;
export const AIM_POWER_MIN = 100;
// Default max ensures PERFECT_SHOT_POWER isn't accidentally clamped.
export const AIM_POWER_MAX = Math.max(2000, PERFECT_SHOT_POWER);

export const PLATFORM_WIDTH = 80;
export const PLATFORM_HEIGHT = 10;

// Vertical distance from the parabola point to the platform's top surface.
export const PLATFORM_PARABOLA_Y_OFFSET = PLATFORM_WIDTH / 2;

export const DOMINO_WIDTH = 20;
export const DOMINO_HEIGHT = 100;
