import { describe, it, expect, beforeEach } from '@jest/globals';
import { ChineseCheckersGame } from '../src/games/chinese-checkers.js';
import { restoreGameState } from './helpers/restore-game-state.js';

type Player = 'red' | 'blue' | 'green' | 'yellow' | 'orange' | 'purple';

type Position = {
  row: number;
  col: number;
};

const SOUTH_TRIANGLE: Position[] = [
  { row: 13, col: 9 },
  { row: 13, col: 11 },
  { row: 13, col: 13 },
  { row: 13, col: 15 },
  { row: 14, col: 10 },
  { row: 14, col: 12 },
  { row: 14, col: 14 },
  { row: 15, col: 11 },
  { row: 15, col: 13 },
  { row: 16, col: 12 },
];

const NORTH_TRIANGLE: Position[] = [
  { row: 0, col: 12 },
  { row: 1, col: 11 },
  { row: 1, col: 13 },
  { row: 2, col: 10 },
  { row: 2, col: 12 },
  { row: 2, col: 14 },
  { row: 3, col: 9 },
  { row: 3, col: 11 },
  { row: 3, col: 13 },
  { row: 3, col: 15 },
];

const createBoard = () => Array.from({ length: 17 }, () => Array(25).fill(null));

function clonePositions(positions: Position[]): Position[] {
  return positions.map((position) => ({ ...position }));
}

async function seedChineseCheckers(
  game: ChineseCheckersGame,
  options: {
    board?: (Player | null)[][];
    currentPlayer?: Player;
    players?: Player[];
    startingPositions?: Record<string, Position[]>;
    targetPositions?: Record<string, Position[]>;
    moveCount?: number;
  } = {}
): Promise<void> {
  await game.initializeGame({ playerCount: 2 });

  await restoreGameState(game, {
    board: options.board ?? createBoard(),
    players: options.players ?? ['red', 'blue'],
    currentPlayer: options.currentPlayer ?? 'red',
    gameOver: false,
    winner: null,
    startingPositions:
      options.startingPositions ??
      ({ red: clonePositions(NORTH_TRIANGLE), blue: clonePositions(SOUTH_TRIANGLE) } as Record<
        string,
        Position[]
      >),
    targetPositions:
      options.targetPositions ??
      ({ red: clonePositions(SOUTH_TRIANGLE), blue: clonePositions(NORTH_TRIANGLE) } as Record<
        string,
        Position[]
      >),
    lastAction: null,
    moveCount: options.moveCount ?? 0,
  });
}

describe('ChineseCheckersGame', () => {
  let game: ChineseCheckersGame;

  beforeEach(() => {
    game = new ChineseCheckersGame('test-game-id');
  });

  it('initializes the official 121-hole star board for a 2-player game', async () => {
    const state = await game.initializeGame({ playerCount: 2 });

    expect(state.players).toEqual(['red', 'blue']);
    expect(state.board).toHaveLength(17);
    expect(state.board[0]).toHaveLength(25);
    expect(state.validPositions).toHaveLength(121);
    expect(state.validPositions).toContain('0,12');
    expect(state.validPositions).toContain('4,0');
    expect(state.validPositions).toContain('4,24');
    expect(state.validPositions).toContain('16,12');
    expect(state.startingPositions.red).toHaveLength(10);
    expect(state.targetPositions.red).toHaveLength(10);
    expect(state.board[0][12]).toBe('red');
    expect(state.board[16][12]).toBe('blue');
  });

  it('initializes the official side-arm setup for 4 players', async () => {
    const state = await game.initializeGame({ playerCount: 4 });

    expect(state.players).toEqual(['red', 'blue', 'green', 'yellow']);
    expect(state.board[4][0]).toBe('red');
    expect(state.board[4][24]).toBe('blue');
    expect(state.board[12][0]).toBe('green');
    expect(state.board[12][24]).toBe('yellow');
    expect(state.startingPositions.red).toHaveLength(10);
    expect(state.startingPositions.yellow).toHaveLength(10);
  });

  it('initializes the full 6-player color layout', async () => {
    const state = await game.initializeGame({ playerCount: 6 });

    expect(state.players).toEqual(['red', 'blue', 'green', 'yellow', 'orange', 'purple']);
    expect(state.board[0][12]).toBe('red');
    expect(state.board[16][12]).toBe('blue');
    expect(state.board[4][0]).toBe('green');
    expect(state.board[12][24]).toBe('yellow');
    expect(state.board[4][24]).toBe('orange');
    expect(state.board[12][0]).toBe('purple');
  });

  it('rejects unsupported 5-player setup because official Chinese Checkers supports 2, 3, 4, or 6 players', async () => {
    await expect(game.initializeGame({ playerCount: 5 })).rejects.toThrow(
      'Official Chinese Checkers supports 2, 3, 4, or 6 players'
    );
  });

  it('allows an adjacent move along the official six-direction lattice', async () => {
    const board = createBoard();
    board[8][12] = 'red';
    board[16][12] = 'blue';
    await seedChineseCheckers(game, { board });

    const validation = await game.validateMove({
      player: 'red',
      from: { row: 8, col: 12 },
      to: { row: 7, col: 11 },
    });

    expect(validation.valid).toBe(true);
  });

  it('rejects moves that do not follow the star-board movement lattice', async () => {
    const board = createBoard();
    board[8][12] = 'red';
    board[16][12] = 'blue';
    await seedChineseCheckers(game, { board });

    const validation = await game.validateMove({
      player: 'red',
      from: { row: 8, col: 12 },
      to: { row: 6, col: 12 },
    });

    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('Invalid move pattern');
  });

  it('allows a single jump over an occupied neighboring hole', async () => {
    const board = createBoard();
    board[8][12] = 'red';
    board[8][14] = 'blue';
    board[16][12] = 'blue';
    await seedChineseCheckers(game, { board });

    const validation = await game.validateMove({
      player: 'red',
      from: { row: 8, col: 12 },
      to: { row: 8, col: 16 },
    });

    expect(validation.valid).toBe(true);

    const state = await game.makeMove({
      player: 'red',
      from: { row: 8, col: 12 },
      to: { row: 8, col: 16 },
    });

    expect(state.board[8][12]).toBeNull();
    expect(state.board[8][16]).toBe('red');
    expect(state.currentPlayer).toBe('blue');
    expect(state.moveCount).toBe(1);
  });

  it('allows a chained diagonal jump sequence across the official lattice', async () => {
    const board = createBoard();
    board[8][12] = 'red';
    board[7][13] = 'blue';
    board[5][15] = 'blue';
    board[16][12] = 'blue';
    await seedChineseCheckers(game, { board });

    const validation = await game.validateMove({
      player: 'red',
      from: { row: 8, col: 12 },
      to: { row: 4, col: 16 },
    });

    expect(validation.valid).toBe(true);

    const state = await game.makeMove({
      player: 'red',
      from: { row: 8, col: 12 },
      to: { row: 4, col: 16 },
    });

    expect(state.board[8][12]).toBeNull();
    expect(state.board[4][16]).toBe('red');
  });

  it('rejects a direct jump when there is no occupied hole to jump over', async () => {
    const board = createBoard();
    board[8][12] = 'red';
    board[16][12] = 'blue';
    await seedChineseCheckers(game, { board });

    const validation = await game.validateMove({
      player: 'red',
      from: { row: 8, col: 12 },
      to: { row: 8, col: 16 },
    });

    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('No piece to jump over');
  });

  it('detects a win when the final marble enters the opposite target triangle', async () => {
    const board = createBoard();

    for (const position of SOUTH_TRIANGLE.filter((position) => !(position.row === 13 && position.col === 11))) {
      board[position.row][position.col] = 'red';
    }
    board[12][10] = 'red';
    board[0][12] = 'blue';

    await seedChineseCheckers(game, {
      board,
      startingPositions: {
        red: clonePositions(NORTH_TRIANGLE),
        blue: clonePositions(SOUTH_TRIANGLE),
      },
      targetPositions: {
        red: clonePositions(SOUTH_TRIANGLE),
        blue: clonePositions(NORTH_TRIANGLE),
      },
    });

    const state = await game.makeMove({
      player: 'red',
      from: { row: 12, col: 10 },
      to: { row: 13, col: 11 },
    });

    expect(state.gameOver).toBe(true);
    expect(state.winner).toBe('red');
    expect(state.lastAction?.action).toBe('win');
  });

  it('rejects moves to coordinates outside the star board', async () => {
    const board = createBoard();
    board[8][12] = 'red';
    board[16][12] = 'blue';
    await seedChineseCheckers(game, { board });

    const validation = await game.validateMove({
      player: 'red',
      from: { row: 8, col: 12 },
      to: { row: 0, col: 0 },
    });

    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('Invalid board positions');
  });
});
