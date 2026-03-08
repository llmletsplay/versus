import { describe, it, expect, beforeEach } from '@jest/globals';
import { ChineseCheckersGame } from '../src/games/chinese-checkers.js';
import { restoreGameState } from './helpers/restore-game-state.js';

type Player = 'red' | 'blue' | 'green' | 'yellow' | 'orange' | 'purple';

type Position = {
  row: number;
  col: number;
};

const createBoard = () => Array.from({ length: 17 }, () => Array(17).fill(null));

async function seedChineseCheckers(
  game: ChineseCheckersGame,
  options: {
    board?: (Player | null)[][];
    currentPlayer?: Player;
    startingPositions?: Record<string, Position[]>;
    targetPositions?: Record<string, Position[]>;
    moveCount?: number;
  } = {}
): Promise<void> {
  await game.initializeGame({ playerCount: 2 });

  const board = options.board ?? createBoard();
  const startingPositions =
    options.startingPositions ??
    ({ red: [{ row: 8, col: 8 }], blue: [{ row: 8, col: 16 }] } as Record<string, Position[]>);
  const targetPositions =
    options.targetPositions ??
    ({ red: [{ row: 8, col: 12 }], blue: [{ row: 8, col: 0 }] } as Record<string, Position[]>);

  await restoreGameState(game, {
    board,
    players: ['red', 'blue'],
    currentPlayer: options.currentPlayer ?? 'red',
    gameOver: false,
    winner: null,
    startingPositions,
    targetPositions,
    lastAction: null,
    moveCount: options.moveCount ?? 0,
  });
}

describe('ChineseCheckersGame', () => {
  let game: ChineseCheckersGame;

  beforeEach(() => {
    game = new ChineseCheckersGame('test-game-id');
  });

  it('initializes with a 17x17 board and valid positions', async () => {
    const state = await game.initializeGame({ playerCount: 2 });
    const internalState = (game as any).currentState;

    expect(state.players).toEqual(['red', 'blue']);
    expect(internalState.board).toHaveLength(17);
    expect(internalState.board[0]).toHaveLength(17);
    expect(state.validPositions).toContain('8,8');
    expect(state.validPositions).toContain('0,8');
  });

  it('allows an adjacent move on an empty valid space', async () => {
    const board = createBoard();
    board[8][8] = 'red';
    board[8][16] = 'blue';
    await seedChineseCheckers(game, {
      board,
      targetPositions: { red: [{ row: 8, col: 14 }], blue: [{ row: 8, col: 0 }] },
    });

    const validation = await game.validateMove({
      player: 'red',
      from: { row: 8, col: 8 },
      to: { row: 8, col: 9 },
    });

    expect(validation.valid).toBe(true);
  });

  it('rejects moves when it is not the player turn', async () => {
    const board = createBoard();
    board[8][8] = 'red';
    board[8][16] = 'blue';
    await seedChineseCheckers(game, { board, currentPlayer: 'red' });

    const validation = await game.validateMove({
      player: 'blue',
      from: { row: 8, col: 16 },
      to: { row: 8, col: 15 },
    });

    expect(validation.valid).toBe(false);
    expect(validation.error).toBe("It's red's turn");
  });

  it('allows a single jump over an occupied midpoint', async () => {
    const board = createBoard();
    board[8][8] = 'red';
    board[8][9] = 'blue';
    board[8][16] = 'blue';
    await seedChineseCheckers(game, { board });

    const validation = await game.validateMove({
      player: 'red',
      from: { row: 8, col: 8 },
      to: { row: 8, col: 10 },
    });
    expect(validation.valid).toBe(true);

    const state = await game.makeMove({
      player: 'red',
      from: { row: 8, col: 8 },
      to: { row: 8, col: 10 },
    });

    expect(state.board[8][8]).toBeNull();
    expect(state.board[8][10]).toBe('red');
    expect(state.currentPlayer).toBe('blue');
    expect(state.moveCount).toBe(1);
  });

  it('allows a multi-jump move across a valid jump chain', async () => {
    const board = createBoard();
    board[8][8] = 'red';
    board[8][9] = 'blue';
    board[8][11] = 'blue';
    board[8][16] = 'blue';
    await seedChineseCheckers(game, {
      board,
      targetPositions: { red: [{ row: 8, col: 14 }], blue: [{ row: 8, col: 0 }] },
    });

    const validation = await game.validateMove({
      player: 'red',
      from: { row: 8, col: 8 },
      to: { row: 8, col: 12 },
    });

    expect(validation.valid).toBe(true);

    const state = await game.makeMove({
      player: 'red',
      from: { row: 8, col: 8 },
      to: { row: 8, col: 12 },
    });

    expect(state.board[8][8]).toBeNull();
    expect(state.board[8][12]).toBe('red');
    expect(state.currentPlayer).toBe('blue');
  });

  it('rejects a direct jump when there is no piece to jump over', async () => {
    const board = createBoard();
    board[8][8] = 'red';
    board[8][16] = 'blue';
    await seedChineseCheckers(game, { board });

    const validation = await game.validateMove({
      player: 'red',
      from: { row: 8, col: 8 },
      to: { row: 8, col: 10 },
    });

    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('No piece to jump over');
  });

  it('detects a win when the final piece reaches the target area', async () => {
    const board = createBoard();
    board[8][9] = 'red';
    board[8][12] = 'red';
    board[8][16] = 'blue';

    await seedChineseCheckers(game, {
      board,
      startingPositions: {
        red: [
          { row: 8, col: 9 },
          { row: 8, col: 12 },
        ],
        blue: [{ row: 8, col: 16 }],
      },
      targetPositions: {
        red: [
          { row: 8, col: 10 },
          { row: 8, col: 12 },
        ],
        blue: [{ row: 8, col: 0 }],
      },
    });

    const state = await game.makeMove({
      player: 'red',
      from: { row: 8, col: 9 },
      to: { row: 8, col: 10 },
    });

    expect(state.gameOver).toBe(true);
    expect(state.winner).toBe('red');
    expect(state.lastAction?.action).toBe('win');
  });

  it('rejects moves to positions outside the star board', async () => {
    const board = createBoard();
    board[8][8] = 'red';
    board[8][16] = 'blue';
    await seedChineseCheckers(game, { board });

    const validation = await game.validateMove({
      player: 'red',
      from: { row: 8, col: 8 },
      to: { row: 0, col: 0 },
    });

    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('Invalid board positions');
  });
});
