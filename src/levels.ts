export type LevelConfig = {
    id: string;
    name: string;
    platformCount: number;
    platformGapFraction: number;
    towerIds: string[];
    /** Power for the "perfect shot" trajectory that places platforms */
    perfectShotPower: number;
};

// Base power for level 1, each subsequent level adds POWER_INCREMENT
const BASE_PERFECT_SHOT_POWER = 750;
const POWER_INCREMENT = 50;

// Helper to generate level power
const getLevelPower = (levelNum: number) => BASE_PERFECT_SHOT_POWER + (levelNum - 1) * POWER_INCREMENT;

// All available tower IDs (add more as created)
const ALL_TOWER_IDS = ['manual-1766309066136', 'manual-1766308758716', 'manual-1766308701967'];

export const LEVELS: LevelConfig[] = [
    {
        id: 'level-1',
        name: 'First Flight',
        platformCount: 1,
        platformGapFraction: 0.4,
        towerIds: ALL_TOWER_IDS,
        perfectShotPower: getLevelPower(1)
    },
    {
        id: 'level-2',
        name: 'Two-Step',
        platformCount: 2,
        platformGapFraction: 0.4,
        towerIds: ALL_TOWER_IDS,
        perfectShotPower: getLevelPower(2)
    },
    {
        id: 'level-3',
        name: 'Triple Threat',
        platformCount: 3,
        platformGapFraction: 0.3,
        towerIds: ALL_TOWER_IDS,
        perfectShotPower: getLevelPower(3)
    },
    {
        id: 'level-4',
        name: 'Quad Squad',
        platformCount: 4,
        platformGapFraction: 0.2,
        towerIds: ALL_TOWER_IDS,
        perfectShotPower: getLevelPower(4)
    },
    {
        id: 'level-5',
        name: 'High Five',
        platformCount: 5,
        platformGapFraction: 0.1,
        towerIds: ALL_TOWER_IDS,
        perfectShotPower: getLevelPower(5)
    },
    {
        id: 'level-6',
        name: 'Six Shooter',
        platformCount: 6,
        platformGapFraction: 0.1,
        towerIds: ALL_TOWER_IDS,
        perfectShotPower: getLevelPower(6)
    },
    {
        id: 'level-7',
        name: 'Lucky Seven',
        platformCount: 7,
        platformGapFraction: 0.1,
        towerIds: ALL_TOWER_IDS,
        perfectShotPower: getLevelPower(7)
    },
    {
        id: 'level-8',
        name: 'Octo-Challenge',
        platformCount: 8,
        platformGapFraction: 0.1,
        towerIds: ALL_TOWER_IDS,
        perfectShotPower: getLevelPower(8)
    },
    {
        id: 'level-9',
        name: 'Nine Lives',
        platformCount: 9,
        platformGapFraction: 0.1,
        towerIds: ALL_TOWER_IDS,
        perfectShotPower: getLevelPower(9)
    },
    {
        id: 'level-10',
        name: 'Perfect Ten',
        platformCount: 10,
        platformGapFraction: 0.1,
        towerIds: ALL_TOWER_IDS,
        perfectShotPower: getLevelPower(10)
    }
];
