export type BeaverUpgradeState = {
    densityLevel: number;
};

export type GameState = {
    levelIndex: number;
    upgrades: BeaverUpgradeState;
};

export const gameState: GameState = {
    levelIndex: 0,
    upgrades: {
        densityLevel: 0
    }
};

export function resetGameState() {
    gameState.levelIndex = 0;
    gameState.upgrades = {
        densityLevel: 0
    };
}
