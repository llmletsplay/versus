import { describe, test, expect, beforeEach } from '@jest/globals';
import { WordTilesGame } from '../src/games/word-tiles.js';
import { restoreGameState } from './helpers/restore-game-state.js';

const TILE_VALUES: Record<string, number> = {
  A: 1,
  C: 3,
  D: 2,
  E: 1,
  H: 4,
  I: 1,
  O: 1,
  Q: 10,
  R: 1,
  T: 1,
  X: 8,
  _: 0,
};

type TestTile = {
  letter: string;
  value: number;
  isBlank?: boolean;
};

function createTile(letter: string): TestTile {
  return {
    letter,
    value: TILE_VALUES[letter] ?? 1,
    isBlank: letter === '_',
  };
}

function cloneBoard(board: any[][]): any[][] {
  return board.map((row) => row.map((cell) => ({ ...cell, tile: cell.tile ? { ...cell.tile } : null })));
}

function getInternalState(game: any): any {
  return game.currentState;
}

async function seedWordTiles(
  game: WordTilesGame,
  options: {
    board?: any[][];
    racks?: Record<string, TestTile[]>;
    scores?: Record<string, number>;
    tileBag?: TestTile[];
    playerOrder?: string[];
    currentPlayer?: string;
    firstMove?: boolean;
    passCount?: number;
    gameOver?: boolean;
    winner?: string | null;
  } = {}
): Promise<void> {
  const playerOrder = options.playerOrder ?? ['player1', 'player2'];
  await game.initializeGame({ playerCount: playerOrder.length });

  const state = getInternalState(game);
  const board = options.board ?? cloneBoard(state.board);
  const players = Object.fromEntries(
    playerOrder.map((playerId) => [
      playerId,
      {
        rack: options.racks?.[playerId] ?? [],
        score: options.scores?.[playerId] ?? 0,
      },
    ])
  );

  await restoreGameState(game, {
    board,
    players,
    tileBag: options.tileBag ?? [],
    currentPlayer: options.currentPlayer ?? playerOrder[0],
    playerOrder,
    gameOver: options.gameOver ?? false,
    winner: options.winner ?? null,
    passCount: options.passCount ?? 0,
    lastMove: null,
    gamePhase: (options.gameOver ?? false) ? 'finished' : 'playing',
    firstMove: options.firstMove ?? true,
  });
}

function boardWithCat(template: any[][]): any[][] {
  const board = cloneBoard(template);
  board[7][7].tile = createTile('C');
  board[7][8].tile = createTile('A');
  board[7][9].tile = createTile('T');
  return board;
}

describe('WordTilesGame', () => {
  let game: WordTilesGame;

  beforeEach(() => {
    game = new WordTilesGame('test-word-tiles-game');
  });

  test('initializes with the requested player count', async () => {
    const state = await game.initializeGame({ playerCount: 4 });

    expect(state.playerOrder).toEqual(['player1', 'player2', 'player3', 'player4']);
    expect(Object.keys(state.players)).toHaveLength(4);
    expect(state.tileBagSize).toBe(72);
  });

  test('sanitizes player racks in public state', async () => {
    const state = await game.initializeGame();

    expect(state.players.player1.rackSize).toBe(7);
    expect(state.players.player1.rack).toBeUndefined();
    expect(state.players.player2.rackSize).toBe(7);
  });

  test('accepts a valid opening word that covers the center star', async () => {
    await seedWordTiles(game, {
      racks: {
        player1: [createTile('C'), createTile('A'), createTile('T')],
        player2: [createTile('D'), createTile('O'), createTile('G')],
      },
      tileBag: [createTile('E'), createTile('R'), createTile('I')],
    });

    const validation = await game.validateMove({
      player: 'player1',
      action: 'play',
      placements: [
        { row: 7, col: 7, tile: createTile('C') },
        { row: 7, col: 8, tile: createTile('A') },
        { row: 7, col: 9, tile: createTile('T') },
      ],
    });

    expect(validation.valid).toBe(true);
  });

  test('rejects an invalid player before turn validation', async () => {
    await seedWordTiles(game, {
      racks: {
        player1: [createTile('C'), createTile('A'), createTile('T')],
        player2: [createTile('D'), createTile('O'), createTile('G')],
      },
    });

    const validation = await game.validateMove({
      player: 'player9',
      action: 'play',
      placements: [{ row: 7, col: 7, tile: createTile('A') }],
    });

    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('Invalid player');
  });

  test('rejects gapped placements that do not form one continuous word', async () => {
    await seedWordTiles(game, {
      racks: {
        player1: [createTile('C'), createTile('T')],
        player2: [createTile('D')],
      },
    });

    const validation = await game.validateMove({
      player: 'player1',
      action: 'play',
      placements: [
        { row: 7, col: 7, tile: createTile('C') },
        { row: 7, col: 9, tile: createTile('T') },
      ],
    });

    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('Placed tiles must form a continuous word');
  });

  test('rejects words that are not in the lexicon', async () => {
    await seedWordTiles(game, {
      racks: {
        player1: [createTile('C'), createTile('Q'), createTile('T')],
        player2: [createTile('D')],
      },
    });

    const validation = await game.validateMove({
      player: 'player1',
      action: 'play',
      placements: [
        { row: 7, col: 7, tile: createTile('C') },
        { row: 7, col: 8, tile: createTile('Q') },
        { row: 7, col: 9, tile: createTile('T') },
      ],
    });

    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('Invalid word: CQT');
  });

  test('accepts a custom lexicon for standalone tournament-style validation', async () => {
    game = new WordTilesGame('test-word-tiles-game', {
      lexicon: ['QI'],
      lexiconName: 'test-official',
    });

    await seedWordTiles(game, {
      racks: {
        player1: [createTile('Q'), createTile('I')],
        player2: [createTile('D')],
      },
    });

    const validation = await game.validateMove({
      player: 'player1',
      action: 'play',
      placements: [
        { row: 7, col: 7, tile: createTile('Q') },
        { row: 7, col: 8, tile: createTile('I') },
      ],
    });

    expect(validation.valid).toBe(true);
    expect((await game.getGameState()).lexicon).toMatchObject({
      source: 'custom',
      name: 'test-official',
      size: 1,
    });
  });

  test('rejects restored games when the runtime lexicon does not match the saved game', async () => {
    const customLexiconGame = new WordTilesGame('word-tiles-lexicon-mismatch', {
      lexicon: ['QI'],
      lexiconName: 'test-official',
    });

    await seedWordTiles(customLexiconGame, {
      racks: {
        player1: [createTile('Q'), createTile('I')],
        player2: [createTile('D')],
      },
    });

    game = new WordTilesGame('word-tiles-lexicon-mismatch');
    await game.initializeGame();
    await restoreGameState(game, structuredClone(getInternalState(customLexiconGame)));

    const validation = await game.validateMove({
      player: 'player1',
      action: 'play',
      placements: [
        { row: 7, col: 7, tile: createTile('Q') },
        { row: 7, col: 8, tile: createTile('I') },
      ],
    });

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('different lexicon');
  });

  test('requires a replacement letter when playing a blank tile', async () => {
    await seedWordTiles(game, {
      racks: {
        player1: [createTile('_'), createTile('T')],
        player2: [createTile('D')],
      },
    });

    const validation = await game.validateMove({
      player: 'player1',
      action: 'play',
      placements: [
        { row: 7, col: 7, tile: createTile('_') },
        { row: 7, col: 8, tile: createTile('T') },
      ],
    });

    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('Blank tiles must declare a replacement letter');
  });

  test('scores an opening word with the center star multiplier', async () => {
    await seedWordTiles(game, {
      racks: {
        player1: [createTile('C'), createTile('A'), createTile('T')],
        player2: [createTile('D')],
      },
      tileBag: [createTile('E'), createTile('R'), createTile('I')],
    });

    const state = await game.makeMove({
      player: 'player1',
      action: 'play',
      placements: [
        { row: 7, col: 7, tile: createTile('C') },
        { row: 7, col: 8, tile: createTile('A') },
        { row: 7, col: 9, tile: createTile('T') },
      ],
    });

    expect(state.players.player1.score).toBe(10);
    expect(state.lastMove?.words).toEqual(['CAT']);
    expect(state.currentPlayer).toBe('player2');
  });

  test('scores cross words using existing letters on the board', async () => {
    await game.initializeGame();
    const templateBoard = getInternalState(game).board;

    await seedWordTiles(game, {
      board: boardWithCat(templateBoard),
      firstMove: false,
      currentPlayer: 'player2',
      racks: {
        player1: [createTile('R')],
        player2: [createTile('H'), createTile('T')],
      },
      scores: { player1: 10, player2: 0 },
      tileBag: [createTile('E'), createTile('I')],
    });

    const state = await game.makeMove({
      player: 'player2',
      action: 'play',
      placements: [
        { row: 6, col: 8, tile: createTile('H') },
        { row: 8, col: 8, tile: createTile('T') },
      ],
    });

    expect(state.players.player2.score).toBe(11);
    expect(state.lastMove?.words).toEqual(['HAT']);
  });

  test('requires later moves to connect to the existing board', async () => {
    await game.initializeGame();
    const templateBoard = getInternalState(game).board;

    await seedWordTiles(game, {
      board: boardWithCat(templateBoard),
      firstMove: false,
      currentPlayer: 'player2',
      racks: {
        player1: [createTile('R')],
        player2: [createTile('D'), createTile('O'), createTile('G')],
      },
    });

    const validation = await game.validateMove({
      player: 'player2',
      action: 'play',
      placements: [
        { row: 0, col: 0, tile: createTile('D') },
        { row: 0, col: 1, tile: createTile('O') },
        { row: 0, col: 2, tile: createTile('G') },
      ],
    });

    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('New tiles must connect to existing tiles on the board');
  });

  test('counts duplicate tiles correctly when validating plays', async () => {
    await seedWordTiles(game, {
      racks: {
        player1: [createTile('A'), createTile('T')],
        player2: [createTile('D')],
      },
    });

    const validation = await game.validateMove({
      player: 'player1',
      action: 'play',
      placements: [
        { row: 7, col: 7, tile: createTile('A') },
        { row: 7, col: 8, tile: createTile('A') },
      ],
    });

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('You do not have one or more of the tiles');
  });

  test('counts duplicate tiles correctly when validating exchanges', async () => {
    await seedWordTiles(game, {
      racks: {
        player1: [createTile('A'), createTile('T')],
        player2: [createTile('D')],
      },
      tileBag: [createTile('E'), createTile('R')],
    });

    const validation = await game.validateMove({
      player: 'player1',
      action: 'exchange',
      exchangeTiles: [createTile('A'), createTile('A')],
    });

    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('You do not have one or more of the tiles you want to exchange');
  });

  test('scores blank tiles as zero while using the declared replacement letter', async () => {
    await seedWordTiles(game, {
      racks: {
        player1: [createTile('_'), createTile('T')],
        player2: [createTile('D')],
      },
      tileBag: [createTile('E')],
    });

    const state = await game.makeMove({
      player: 'player1',
      action: 'play',
      placements: [
        { row: 7, col: 7, tile: createTile('_'), letter: 'A' },
        { row: 7, col: 8, tile: createTile('T') },
      ],
    });

    expect(state.board[7][7].tile).toEqual({ letter: 'A', value: 0, isBlank: true });
    expect(state.players.player1.score).toBe(2);
    expect(state.lastMove?.words).toEqual(['AT']);
  });

  test('does not end the game just because the tile bag is empty', async () => {
    await seedWordTiles(game, {
      racks: {
        player1: [createTile('C'), createTile('A'), createTile('T'), createTile('R')],
        player2: [createTile('D')],
      },
      tileBag: [],
    });

    const state = await game.makeMove({
      player: 'player1',
      action: 'play',
      placements: [
        { row: 7, col: 7, tile: createTile('C') },
        { row: 7, col: 8, tile: createTile('A') },
        { row: 7, col: 9, tile: createTile('T') },
      ],
    });

    expect(state.gameOver).toBe(false);
    expect(state.winner).toBeNull();
  });

  test('ends the game when a player uses their last tile and the bag is empty', async () => {
    await seedWordTiles(game, {
      racks: {
        player1: [createTile('A')],
        player2: [createTile('D')],
      },
      tileBag: [],
    });

    const state = await game.makeMove({
      player: 'player1',
      action: 'play',
      placements: [{ row: 7, col: 7, tile: createTile('A') }],
    });

    expect(state.gameOver).toBe(true);
    expect(state.winner).toBe('player1');
    expect(state.players.player1.score).toBe(2);
  });
});
