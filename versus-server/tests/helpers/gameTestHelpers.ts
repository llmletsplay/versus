import { BaseGame } from '../../src/core/base-game.js';
import { expect } from '@jest/globals';

export interface GameTestCase {
  name: string;
  setup?: () => void;
  moves: Array<{
    move: any;
    expectedValid: boolean;
    expectedGameState?: any;
    expectedWinner?: string | null;
    expectedGameOver?: boolean;
  }>;
}

export class GameTester {
  static async runTestCase(
    GameClass: new (_gameId: string, _gameType: string) => BaseGame,
    testCase: GameTestCase
  ) {
    const game = new GameClass('test-game', 'test-type');

    if (testCase.setup) {
      testCase.setup();
    }

    for (let i = 0; i < testCase.moves.length; i++) {
      const { move, expectedValid, expectedGameState, expectedWinner, expectedGameOver } =
        testCase.moves[i];

      try {
        await game.makeMove(move);

        if (expectedValid) {
          // Move succeeded, check additional expectations
          if (expectedGameState) {
            const state = await game.getGameState();
            expect(state.gameState).toEqual(expectedGameState);
          }

          if (expectedWinner !== undefined) {
            const state = await game.getGameState();
            expect(state.winner).toBe(expectedWinner);
          }

          if (expectedGameOver !== undefined) {
            const gameOver = await game.isGameOver();
            expect(gameOver).toBe(expectedGameOver);
          }
        } else {
          // Should not reach here if move was supposed to be invalid
          throw new Error(`Expected move ${i} to be invalid but it succeeded`);
        }
      } catch (error) {
        if (expectedValid) {
          throw new Error(`Expected move ${i} to be valid but got error: ${error}`);
        }
        // Expected to fail, continue
      }
    }
  }

  static createMoveTest(move: any, expectedValid: boolean, additionalChecks: any = {}) {
    return {
      move,
      expectedValid,
      ...additionalChecks,
    };
  }
}

export function createMockGameState(_gameId: string, _gameType: string): any {
  // Remove unused result assignment
  await game.initializeGame();
}
