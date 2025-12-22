import type { ProblemType, YearLevel } from 'maths-game-problem-generator';
import { MATH_YEAR_LEVEL } from './config';

export type GameSettings = {
    yearLevel: YearLevel;
    problemType?: ProblemType;
};

export const gameSettings: GameSettings = {
    yearLevel: MATH_YEAR_LEVEL as YearLevel,
    problemType: undefined
};

export function updateGameSettings(next: Partial<GameSettings>) {
    Object.assign(gameSettings, next);
}
