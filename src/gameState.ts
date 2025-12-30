export type BeaverUpgradeState = {
    sizeLevel: number;
    densityLevel: number;
};

export type GameState = {
    levelIndex: number;
    upgrades: BeaverUpgradeState;
};

export const gameState: GameState = {
    levelIndex: 0,
    upgrades: {
        sizeLevel: 0,
        densityLevel: 0
    }
};

export function resetGameState() {
    gameState.levelIndex = 0;
    gameState.upgrades = {
        sizeLevel: 0,
        densityLevel: 0
    };
}
