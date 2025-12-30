// Vertical distance from the floor to the catapult/origin point.
export const CATAPULT_HEIGHT_ABOVE_FLOOR = 400;

// "Perfect shot" controls the reference trajectory (platform layout) and the initial aim.
// Note: Each level now has its own perfectShotPower in levels.ts
export const PERFECT_SHOT_ANGLE_DEG: number = -55;

export const AIM_ANGLE_MIN_DEG = -90;
export const AIM_ANGLE_MAX_DEG = 0;
export const AIM_POWER_MIN = 100;

export const PLATFORM_WIDTH = 200;
export const PLATFORM_HEIGHT = 10;

// Vertical distance from the parabola point to the platform's top surface.
export const PLATFORM_PARABOLA_Y_OFFSET = PLATFORM_WIDTH / 2;

// --- Maths Challenge ---
export const MATH_YEAR_LEVEL = 'year1';
export const QUESTION_TEXT_OFFSET_Y = 140;
export const ANSWER_TEXT_OFFSET_Y = 40;

// --- Tower / Plank Configuration ---
// Standard “building block” dimensions used by tower library.
export const PLANK_WIDTH = 20; // thickness
export const PLANK_LENGTH = 120; // long side (equal for all planks)
export const PLANK_DENSITY = 4.0;

// --- Beaver / Ball ---
export const BEAVER_RADIUS = 45;
export const BEAVER_DENSITY = 100.8;
export const BEAVER_RADIUS_LEVELS = [BEAVER_RADIUS, 60, 75];
// 10 density levels for upgrades (starts at BEAVER_DENSITY, increases to 8.0)
export const BEAVER_DENSITY_LEVELS = [
    BEAVER_DENSITY,  // Level 1: 0.8
    BEAVER_DENSITY * 1.2,             // Level 2
    BEAVER_DENSITY * 1.8,             // Level 3
    BEAVER_DENSITY * 2.5,             // Level 4
    BEAVER_DENSITY * 3.2,             // Level 5
    BEAVER_DENSITY * 4.0,             // Level 6
    BEAVER_DENSITY * 5.0,             // Level 7
    BEAVER_DENSITY * 6.0,             // Level 8
    BEAVER_DENSITY * 7.0,             // Level 9
    BEAVER_DENSITY * 8.0              // Level 10
];
// Delay before returning the ball after it comes to rest.
export const BALL_RESET_DELAY_MS = 100;
// Extra height above the floor for tower balls to count as "hit the floor".
export const TOWER_BALL_FLOOR_MARGIN = 40;

// --- Debug ---
export const DEBUG_RAPIER = true; // physics wireframes
export const DEBUG_BOUNDS = true; // Phaser object AABBs

// --- Physics ---
export const GRAVITY_MULTIPLIER = 30;
