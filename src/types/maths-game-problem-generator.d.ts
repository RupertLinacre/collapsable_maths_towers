declare module 'maths-game-problem-generator' {
    export type YearLevel =
        | 'reception'
        | 'year1'
        | 'year2'
        | 'year3'
        | 'year4'
        | 'year5'
        | 'year6';

    export type ProblemType =
        | 'addition'
        | 'subtraction'
        | 'multiplication'
        | 'division'
        | 'squared'
        | 'cube';

    export interface MathProblem {
        expression: string;
        expression_short: string;
        answer: number;
        formattedAnswer: string;
        type: ProblemType | string;
        yearLevel: YearLevel | string;
    }

    export interface GenerateProblemOptions {
        yearLevel?: YearLevel | string;
        type?: ProblemType | string;
    }

    export function generateProblem(options?: GenerateProblemOptions): MathProblem;
    export function checkAnswer(problem: MathProblem, userAnswer: number | string): boolean;
    export function getYearLevels(): YearLevel[];
    export function getProblemTypes(): ProblemType[];
    export const YEAR_LEVELS: Record<string, YearLevel>;
    export const PROBLEM_TYPES: Record<string, ProblemType>;

    const MathProblemGenerator: {
        generateProblem: typeof generateProblem;
        checkAnswer: typeof checkAnswer;
        getYearLevels: typeof getYearLevels;
        getProblemTypes: typeof getProblemTypes;
        yearLevels: typeof YEAR_LEVELS;
        problemTypes: typeof PROBLEM_TYPES;
    };

    export default MathProblemGenerator;
}
