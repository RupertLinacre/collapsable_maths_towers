export const LEVEL_PLATFORM_COUNT: number = 2
// Fraction (0..1) of the trajectory to leave empty before placing platforms.
// Example: 0.5 starts placement at the apex; 0.33 starts after the first third.
export const LEVEL_PLATFORM_GAP_FRACTION: number = 0.5;

// Vertical distance from the floor to the catapult/origin point.
export const CATAPULT_HEIGHT_ABOVE_FLOOR = 400;

// "Perfect shot" controls the reference trajectory (platform layout) and the initial aim.
// Increase power to make the parabola wider (platforms further away).
export const PERFECT_SHOT_ANGLE_DEG: number = -55;
export const PERFECT_SHOT_POWER: number = 750;

export const AIM_ANGLE_MIN_DEG = -90;
export const AIM_ANGLE_MAX_DEG = 0;
export const AIM_POWER_MIN = 100;
// Max launch power the player can select (keep >= PERFECT_SHOT_POWER).
// Base max launch power (upgrades can increase this).
export const AIM_POWER_MAX = 10000;

export const PLATFORM_WIDTH = 200;
export const PLATFORM_HEIGHT = 10;

// Vertical distance from the parabola point to the platform's top surface.
export const PLATFORM_PARABOLA_Y_OFFSET = PLATFORM_WIDTH / 2;

// --- Maths Challenge ---
export const MATH_YEAR_LEVEL = 'year2';
export const QUESTION_TEXT_OFFSET_Y = 140;
export const ANSWER_TEXT_OFFSET_Y = 40;

// --- Tower / Plank Configuration ---
// Standard “building block” dimensions used by tower library.
export const PLANK_WIDTH = 20; // thickness
export const PLANK_LENGTH = 120; // long side (equal for all planks)
export const PLANK_DENSITY = 4.0;

// --- Background ---
export const BACKGROUND_SCALE = 4.0;
export const BACKGROUND_ANCHOR_X = 100;
export const BACKGROUND_ANCHOR_Y = 1000;

// --- Beaver / Ball ---
export const BEAVER_RADIUS = 45;
export const BEAVER_DENSITY = 0.8;
export const BEAVER_RADIUS_LEVELS = [BEAVER_RADIUS, 60, 75];
export const BEAVER_DENSITY_LEVELS = [BEAVER_DENSITY, 2, 5];
export const BEAVER_POWER_LEVELS = [AIM_POWER_MAX, AIM_POWER_MAX + 2000, AIM_POWER_MAX + 4000];
// Delay before returning the ball after it comes to rest.
export const BALL_RESET_DELAY_MS = 3000;

// --- Debug ---
export const DEBUG_RAPIER = false; // physics wireframes
export const DEBUG_BOUNDS = false; // Phaser object AABBs

// --- Physics ---
export const GRAVITY_MULTIPLIER = 30;
