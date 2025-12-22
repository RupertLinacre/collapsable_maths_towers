export type LevelConfig = {
    id: string;
    name: string;
    platformCount: number;
    platformGapFraction: number;
    towerIds: string[];
};

export const LEVELS: LevelConfig[] = [
    {
        id: 'level-1',
        name: 'First Flight',
        platformCount: 1,
        platformGapFraction: 0.55,
        towerIds: ['manual-1766309066136']
    },
    {
        id: 'level-2',
        name: 'Two-Step',
        platformCount: 2,
        platformGapFraction: 0.45,
        towerIds: ['manual-1766309066136', 'manual-1766308758716']
    },
    {
        id: 'level-3',
        name: 'Tall Tangle',
        platformCount: 3,
        platformGapFraction: 0.35,
        towerIds: ['manual-1766309066136', 'manual-1766308758716', 'manual-1766308701967']
    }
];
