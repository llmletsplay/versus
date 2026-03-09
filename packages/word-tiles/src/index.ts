import { createHash } from 'node:crypto';
import { InMemoryDatabaseProvider } from '@versus/game-core';
import { BaseGame } from '@versus/game-core';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '@versus/game-core';
import type { DatabaseProvider } from '@versus/game-core';

type TileLetter =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I'
  | 'J'
  | 'K'
  | 'L'
  | 'M'
  | 'N'
  | 'O'
  | 'P'
  | 'Q'
  | 'R'
  | 'S'
  | 'T'
  | 'U'
  | 'V'
  | 'W'
  | 'X'
  | 'Y'
  | 'Z'
  | '_';

interface WordsTile {
  letter: TileLetter;
  value: number;
  isBlank?: boolean; // For blank tiles that can represent any letter
}

interface BoardCell {
  tile: WordsTile | null;
  multiplier?: 'DL' | 'TL' | 'DW' | 'TW' | 'STAR'; // Double Letter, Triple Letter, Double Word, Triple Word, Star (center)
}

export interface WordsState extends GameState {
  board: BoardCell[][];
  players: {
    [playerId: string]: {
      rack: WordsTile[];
      score: number;
    };
  };
  tileBag: WordsTile[];
  currentPlayer: string;
  playerOrder: string[];
  gameOver: boolean;
  winner: string | null;
  passCount: number; // Number of consecutive passes
  lastMove: {
    playerId: string;
    words: string[];
    score: number;
    tilesPlaced: Array<{ row: number; col: number; tile: WordsTile }>;
  } | null;
  gamePhase: 'playing' | 'finished';
  firstMove: boolean; // Must cover center star
  lexicon?: WordsLexiconMetadata;
}

interface WordsMove {
  player: string;
  action: 'play' | 'pass' | 'exchange';
  placements?: Array<{ row: number; col: number; tile: WordsTile; letter?: TileLetter }>; // letter for blank tiles
  exchangeTiles?: WordsTile[]; // For exchange action
}

interface WordsLexiconMetadata {
  source: 'built-in' | 'custom';
  size: number;
  fingerprint: string;
  name?: string;
}

interface WordTilesOptions {
  lexicon?: Iterable<string>;
  lexiconName?: string;
}

function isDatabaseProvider(value: unknown): value is DatabaseProvider {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as DatabaseProvider).initialize === 'function' &&
      typeof (value as DatabaseProvider).saveGameState === 'function' &&
      typeof (value as DatabaseProvider).getGameState === 'function'
  );
}

function normalizeLexiconWords(words: Iterable<string>): string[] {
  const normalizedWords = Array.from(
    new Set(
      Array.from(words, (word) => String(word).trim().toUpperCase()).filter((word) => /^[A-Z]+$/.test(word))
    )
  ).sort();

  if (normalizedWords.length === 0) {
    throw new Error('Custom lexicon must contain at least one A-Z word');
  }

  return normalizedWords;
}

function createLexiconFingerprint(words: Iterable<string>): string {
  const hash = createHash('sha256');

  for (const word of normalizeLexiconWords(words)) {
    hash.update(word);
    hash.update('\n');
  }

  return hash.digest('hex').slice(0, 16);
}

export class WordTilesGame extends BaseGame {
  private readonly BOARD_SIZE = 15;
  private readonly RACK_SIZE = 7;

  // Standard tile distribution and values
  private readonly TILE_DISTRIBUTION: Array<{ letter: TileLetter; count: number; value: number }> =
    [
      { letter: 'A', count: 9, value: 1 },
      { letter: 'B', count: 2, value: 3 },
      { letter: 'C', count: 2, value: 3 },
      { letter: 'D', count: 4, value: 2 },
      { letter: 'E', count: 12, value: 1 },
      { letter: 'F', count: 2, value: 4 },
      { letter: 'G', count: 3, value: 2 },
      { letter: 'H', count: 2, value: 4 },
      { letter: 'I', count: 9, value: 1 },
      { letter: 'J', count: 1, value: 8 },
      { letter: 'K', count: 1, value: 5 },
      { letter: 'L', count: 4, value: 1 },
      { letter: 'M', count: 2, value: 3 },
      { letter: 'N', count: 6, value: 1 },
      { letter: 'O', count: 8, value: 1 },
      { letter: 'P', count: 2, value: 3 },
      { letter: 'Q', count: 1, value: 10 },
      { letter: 'R', count: 6, value: 1 },
      { letter: 'S', count: 4, value: 1 },
      { letter: 'T', count: 6, value: 1 },
      { letter: 'U', count: 4, value: 1 },
      { letter: 'V', count: 2, value: 4 },
      { letter: 'W', count: 2, value: 4 },
      { letter: 'X', count: 1, value: 8 },
      { letter: 'Y', count: 2, value: 4 },
      { letter: 'Z', count: 1, value: 10 },
      { letter: '_', count: 2, value: 0 }, // Blank tiles
    ];

  // Premium squares layout (cached for efficiency)
  private readonly PREMIUM_SQUARES_MAP = new Map<string, 'DL' | 'TL' | 'DW' | 'TW' | 'STAR'>();
  private readonly activeLexicon: ReadonlySet<string>;
  private readonly lexiconMetadata: WordsLexiconMetadata;

  // Expanded word list for better validation
  private readonly VALID_WORDS = new Set([
    'A',
    'I',
    'AT',
    'TO',
    'IN',
    'ON',
    'NO',
    'HE',
    'HI',
    'IT',
    'AX',
    'OX',
    'HAT',
    'HATS',
    'HATE',
    'TAX',
    'TAXI',
    'AXE',
    // Common words
    'THE',
    'AND',
    'FOR',
    'ARE',
    'BUT',
    'NOT',
    'YOU',
    'ALL',
    'CAN',
    'HER',
    'WAS',
    'ONE',
    'OUR',
    'HAD',
    'BY',
    'HOT',
    'SOME',
    'WHAT',
    'THERE',
    'WE',
    'OUT',
    'OTHER',
    'WERE',
    'YOUR',
    'WHEN',
    'UP',
    'USE',
    'WORD',
    'HOW',
    'SAID',
    'EACH',
    'SHE',
    'WHICH',
    'DO',
    'THEIR',
    'TIME',
    'WILL',
    'ABOUT',
    'IF',
    'MANY',
    'THEN',
    'THEM',
    'THESE',
    'SO',
    'WOULD',
    'MAKE',
    'LIKE',
    'INTO',
    'HIM',
    'HAS',
    'TWO',
    'MORE',
    'GO',
    'NO',
    'WAY',
    'COULD',
    'MY',
    'THAN',
    'FIRST',
    'BEEN',
    'CALL',
    'WHO',
    'ITS',
    'NOW',
    'FIND',
    'LONG',
    'DOWN',
    'DAY',
    'DID',
    'GET',
    'COME',
    'MADE',
    'MAY',
    'PART',

    // Game-related words
    'CAT',
    'DOG',
    'HOUSE',
    'TREE',
    'WATER',
    'FIRE',
    'EARTH',
    'WIND',
    'LOVE',
    'HOPE',
    'GAME',
    'PLAY',
    'TILE',
    'SCORE',
    'BOARD',
    'LETTER',
    'BLANK',
    'TRIPLE',
    'DOUBLE',
    'BONUS',
    'POINT',
    'RACK',
    'DRAW',
    'PASS',
    'EXCHANGE',
    'VALID',
    'PLACE',
    'WORDS',
    'DICTIONARY',
    'CHALLENGE',
    'BINGO',
    'PREMIUM',
    'SQUARE',
    'HORIZONTAL',
    'VERTICAL',
    'DIAGONAL',
    'ADJACENT',
    'CONNECT',
    'BUILD',
    'EXTEND',
    'CREATE',
    'STRATEGY',
    'VOCABULARY',
    'LANGUAGE',
    'ENGLISH',
    'ALPHABET',
    'CONSONANT',
    'VOWEL',

    // Additional common words for better gameplay
    'QUICK',
    'BROWN',
    'FOX',
    'JUMPS',
    'OVER',
    'LAZY',
    'PACK',
    'FIVE',
    'BOXING',
    'WIZARDS',
    'JUMP',
    'CRAZY',
    'VEXED',
    'NYMPH',
    'WALTZ',
    'BAD',
    'FUDGE',
    'JUDGE',
    'JINX',
    'ZIP',
    'QUIZ',
    'FJORD',
    'GLYPH',
    'VOWS',
    'CHUNK',
    'DWARF',
    'BOXING',
    'QUIPS',
    'FJORD',
    'NIGHT',
    'FLIGHT',
    'BRIGHT',
    'LIGHT',
    'SIGHT',
    'RIGHT',
    'MIGHT',
    'FIGHT',
    'TIGHT',
    'HEIGHT',
    'WEIGHT',
    'EIGHT',
    'FREIGHT',
  ]);

  constructor(
    gameId: string,
    databaseOrOptions: DatabaseProvider | WordTilesOptions = new InMemoryDatabaseProvider(),
    options: WordTilesOptions = {}
  ) {
    const database = isDatabaseProvider(databaseOrOptions)
      ? databaseOrOptions
      : new InMemoryDatabaseProvider();
    const resolvedOptions = isDatabaseProvider(databaseOrOptions) ? options : databaseOrOptions;

    super(gameId, 'word-tiles', database);
    this.initializePremiumSquares();

    const lexiconWords = resolvedOptions.lexicon
      ? normalizeLexiconWords(resolvedOptions.lexicon)
      : Array.from(this.VALID_WORDS).sort();

    this.activeLexicon = new Set(lexiconWords);
    this.lexiconMetadata = {
      source: resolvedOptions.lexicon ? 'custom' : 'built-in',
      size: this.activeLexicon.size,
      fingerprint: createLexiconFingerprint(lexiconWords),
      name: resolvedOptions.lexicon ? resolvedOptions.lexiconName : undefined,
    };
  }

  private initializePremiumSquares(): void {
    // Cache premium squares for O(1) lookup
    const squares = [
      // Star (center)
      { row: 7, col: 7, type: 'STAR' as const },

      // Triple Word Score corners
      { row: 0, col: 0, type: 'TW' as const },
      { row: 0, col: 7, type: 'TW' as const },
      { row: 0, col: 14, type: 'TW' as const },
      { row: 7, col: 0, type: 'TW' as const },
      { row: 7, col: 14, type: 'TW' as const },
      { row: 14, col: 0, type: 'TW' as const },
      { row: 14, col: 7, type: 'TW' as const },
      { row: 14, col: 14, type: 'TW' as const },

      // Double Word Score
      { row: 1, col: 1, type: 'DW' as const },
      { row: 1, col: 13, type: 'DW' as const },
      { row: 2, col: 2, type: 'DW' as const },
      { row: 2, col: 12, type: 'DW' as const },
      { row: 3, col: 3, type: 'DW' as const },
      { row: 3, col: 11, type: 'DW' as const },
      { row: 4, col: 4, type: 'DW' as const },
      { row: 4, col: 10, type: 'DW' as const },
      { row: 10, col: 4, type: 'DW' as const },
      { row: 10, col: 10, type: 'DW' as const },
      { row: 11, col: 3, type: 'DW' as const },
      { row: 11, col: 11, type: 'DW' as const },
      { row: 12, col: 2, type: 'DW' as const },
      { row: 12, col: 12, type: 'DW' as const },
      { row: 13, col: 1, type: 'DW' as const },
      { row: 13, col: 13, type: 'DW' as const },

      // Triple Letter Score
      { row: 1, col: 5, type: 'TL' as const },
      { row: 1, col: 9, type: 'TL' as const },
      { row: 5, col: 1, type: 'TL' as const },
      { row: 5, col: 5, type: 'TL' as const },
      { row: 5, col: 9, type: 'TL' as const },
      { row: 5, col: 13, type: 'TL' as const },
      { row: 9, col: 1, type: 'TL' as const },
      { row: 9, col: 5, type: 'TL' as const },
      { row: 9, col: 9, type: 'TL' as const },
      { row: 9, col: 13, type: 'TL' as const },
      { row: 13, col: 5, type: 'TL' as const },
      { row: 13, col: 9, type: 'TL' as const },

      // Double Letter Score
      { row: 0, col: 3, type: 'DL' as const },
      { row: 0, col: 11, type: 'DL' as const },
      { row: 2, col: 6, type: 'DL' as const },
      { row: 2, col: 8, type: 'DL' as const },
      { row: 3, col: 0, type: 'DL' as const },
      { row: 3, col: 7, type: 'DL' as const },
      { row: 3, col: 14, type: 'DL' as const },
      { row: 6, col: 2, type: 'DL' as const },
      { row: 6, col: 6, type: 'DL' as const },
      { row: 6, col: 8, type: 'DL' as const },
      { row: 6, col: 12, type: 'DL' as const },
      { row: 7, col: 3, type: 'DL' as const },
      { row: 7, col: 11, type: 'DL' as const },
      { row: 8, col: 2, type: 'DL' as const },
      { row: 8, col: 6, type: 'DL' as const },
      { row: 8, col: 8, type: 'DL' as const },
      { row: 8, col: 12, type: 'DL' as const },
      { row: 11, col: 0, type: 'DL' as const },
      { row: 11, col: 7, type: 'DL' as const },
      { row: 11, col: 14, type: 'DL' as const },
      { row: 12, col: 6, type: 'DL' as const },
      { row: 12, col: 8, type: 'DL' as const },
      { row: 14, col: 3, type: 'DL' as const },
      { row: 14, col: 11, type: 'DL' as const },
    ];

    for (const square of squares) {
      this.PREMIUM_SQUARES_MAP.set(`${square.row},${square.col}`, square.type);
    }
  }

  async initializeGame(config?: GameConfig): Promise<GameState> {
    // Create initial board with premium squares
    const board = this.createInitialBoard();

    // Create tile bag
    const tileBag = this.createTileBag();
    this.shuffleTiles(tileBag);

    // Initialize players (2-4 players)
    const requestedPlayerCount = (config as any)?.playerCount ?? (config as any)?.customRules?.playerCount ?? 2;
    const playerCount = Math.min(Math.max(requestedPlayerCount, 2), 4);
    const playerIds = Array.from({ length: playerCount }, (_, i) => `player${i + 1}`);

    const players: WordsState['players'] = {};

    // Deal initial racks
    for (const playerId of playerIds) {
      players[playerId] = {
        rack: this.drawTiles(tileBag, this.RACK_SIZE),
        score: 0,
      };
    }

    const initialState: WordsState = {
      gameId: this.gameId,
      gameType: this.gameType,
      board,
      players,
      tileBag,
      currentPlayer: playerIds[0]!,
      playerOrder: playerIds,
      gameOver: false,
      winner: null,
      passCount: 0,
      lastMove: null,
      gamePhase: 'playing',
      firstMove: true,
      lexicon: { ...this.lexiconMetadata },
    };

    this.currentState = initialState;
    await this.persistState();

    return this.getGameState();
  }

  private createInitialBoard(): BoardCell[][] {
    const board: BoardCell[][] = Array.from({ length: this.BOARD_SIZE }, () =>
      Array.from({ length: this.BOARD_SIZE }, () => ({ tile: null }))
    );

    // Add premium squares using cached map
    for (let row = 0; row < this.BOARD_SIZE; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        const multiplier = this.PREMIUM_SQUARES_MAP.get(`${row},${col}`);
        if (multiplier) {
          board[row]![col]!.multiplier = multiplier;
        }
      }
    }

    return board;
  }

  private createTileBag(): WordsTile[] {
    const tiles: WordsTile[] = [];

    for (const { letter, count, value } of this.TILE_DISTRIBUTION) {
      for (let i = 0; i < count; i++) {
        tiles.push({
          letter,
          value,
          isBlank: letter === '_',
        });
      }
    }

    return tiles;
  }

  private shuffleTiles(tiles: WordsTile[]): void {
    // Fisher-Yates shuffle for better randomization
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tiles[i]!, tiles[j]!] = [tiles[j]!, tiles[i]!];
    }
  }

  private drawTiles(tileBag: WordsTile[], count: number): WordsTile[] {
    return tileBag.splice(0, Math.min(count, tileBag.length));
  }

  private getStateLexicon(state: WordsState): WordsLexiconMetadata {
    return state.lexicon ?? this.lexiconMetadata;
  }

  private getLexiconMismatchError(state: WordsState): string | null {
    if (!state.lexicon) {
      return null;
    }

    return state.lexicon.fingerprint === this.lexiconMetadata.fingerprint
      ? null
      : 'This game was created with a different lexicon configuration';
  }

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const move = moveData as WordsMove;

      if (!move.player || !move.action) {
        return { valid: false, error: 'Move must include player and action' };
      }

      const state = this.currentState as WordsState;
      const lexiconMismatchError = this.getLexiconMismatchError(state);

      if (lexiconMismatchError) {
        return { valid: false, error: lexiconMismatchError };
      }

      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      if (!state.players[move.player]) {
        return { valid: false, error: 'Invalid player' };
      }

      if (move.player !== state.currentPlayer) {
        return { valid: false, error: 'Not your turn' };
      }

      if (move.action === 'pass') {
        return { valid: true };
      }

      if (move.action === 'exchange') {
        if (!move.exchangeTiles || move.exchangeTiles.length === 0) {
          return { valid: false, error: 'Must specify tiles to exchange' };
        }

        if (state.tileBag.length < move.exchangeTiles.length) {
          return { valid: false, error: 'Not enough tiles in bag for exchange' };
        }

        // Verify player has the tiles they want to exchange, including duplicates.
        const rackCounts = this.countTiles(state.players[move.player]!.rack);
        for (const tile of move.exchangeTiles) {
          if (!this.consumeTile(rackCounts, tile)) {
            return {
              valid: false,
              error: 'You do not have one or more of the tiles you want to exchange',
            };
          }
        }

        return { valid: true };
      }

      if (move.action === 'play') {
        if (!move.placements || move.placements.length === 0) {
          return { valid: false, error: 'Must place at least one tile' };
        }

        return this.validateWordPlay(move, state);
      }

      return { valid: false, error: 'Invalid action' };
    } catch {
      return { valid: false, error: 'Invalid move data format' };
    }
  }

  private validateWordPlay(move: WordsMove, state: WordsState): MoveValidationResult {
    const placements = move.placements!;
    const playerRack = state.players[move.player]!.rack;
    const seenPositions = new Set<string>();
    const rackCounts = this.countTiles(playerRack);

    for (const placement of placements) {
      if (!this.isValidPosition(placement.row, placement.col)) {
        return { valid: false, error: 'Invalid board position' };
      }

      const positionKey = `${placement.row},${placement.col}`;
      if (seenPositions.has(positionKey)) {
        return { valid: false, error: 'Cannot place multiple tiles on the same square' };
      }
      seenPositions.add(positionKey);

      if (state.board[placement.row]![placement.col]!.tile) {
        return { valid: false, error: 'Cannot place tile on occupied square' };
      }

      if (placement.tile.isBlank) {
        if (!this.isAssignableLetter(placement.letter)) {
          return { valid: false, error: 'Blank tiles must declare a replacement letter' };
        }
      } else if (placement.letter && placement.letter !== placement.tile.letter) {
        return { valid: false, error: 'Only blank tiles can declare a replacement letter' };
      }

      if (!this.consumeTile(rackCounts, placement.tile)) {
        return {
          valid: false,
          error: 'You do not have one or more of the tiles you are trying to place',
        };
      }
    }

    if (!this.areTilesInLine(placements)) {
      return { valid: false, error: 'All tiles must be placed in a single row or column' };
    }

    if (!this.isPlacementContinuous(placements, state.board)) {
      return { valid: false, error: 'Placed tiles must form a continuous word' };
    }

    if (state.firstMove) {
      const coversStar = placements.some((p) => p.row === 7 && p.col === 7);
      if (!coversStar) {
        return { valid: false, error: 'First move must cover the center star' };
      }
    } else if (!this.connectsToExistingTiles(placements, state.board)) {
      return { valid: false, error: 'New tiles must connect to existing tiles on the board' };
    }

    const boardAfter = this.createBoardWithPlacements(state.board, placements);
    const formedWords = this.collectFormedWords(placements, boardAfter, state.firstMove);

    if (formedWords.length === 0) {
      return { valid: false, error: 'Move must form at least one valid word' };
    }

    const invalidWord = formedWords.find(({ word }) => !this.isValidWord(word));
    if (invalidWord) {
      return { valid: false, error: `Invalid word: ${invalidWord.word}` };
    }

    return { valid: true };
  }

  private isValidPosition(row: number, col: number): boolean {
    return row >= 0 && row < this.BOARD_SIZE && col >= 0 && col < this.BOARD_SIZE;
  }

  private isAssignableLetter(letter?: TileLetter): boolean {
    return typeof letter === 'string' && /^[A-Z]$/.test(letter);
  }

  private createTileKey(tile: WordsTile): string {
    return `${tile.letter}:${tile.value}:${tile.isBlank ? '1' : '0'}`;
  }

  private countTiles(tiles: WordsTile[]): Map<string, number> {
    const counts = new Map<string, number>();

    for (const tile of tiles) {
      const key = this.createTileKey(tile);
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    return counts;
  }

  private consumeTile(counts: Map<string, number>, tile: WordsTile): boolean {
    const key = this.createTileKey(tile);
    const remaining = counts.get(key) || 0;

    if (remaining === 0) {
      return false;
    }

    counts.set(key, remaining - 1);
    return true;
  }

  private resolvePlacementTile(placement: {
    row: number;
    col: number;
    tile: WordsTile;
    letter?: TileLetter;
  }): WordsTile {
    if (!placement.tile.isBlank) {
      return { ...placement.tile };
    }

    return {
      ...placement.tile,
      letter: placement.letter!,
      isBlank: true,
    };
  }

  private createBoardWithPlacements(
    board: BoardCell[][],
    placements: Array<{ row: number; col: number; tile: WordsTile; letter?: TileLetter }>
  ): BoardCell[][] {
    const nextBoard = board.map((row) =>
      row.map((cell) => ({
        ...cell,
        tile: cell.tile ? { ...cell.tile } : null,
      }))
    );

    for (const placement of placements) {
      nextBoard[placement.row]![placement.col]!.tile = this.resolvePlacementTile(placement);
    }

    return nextBoard;
  }

  private areTilesInLine(
    placements: Array<{ row: number; col: number; tile: WordsTile }>
  ): boolean {
    if (placements.length === 1) {
      return true;
    }

    const rows = placements.map((p) => p.row);
    const cols = placements.map((p) => p.col);

    const sameRow = rows.every((r) => r === rows[0]);
    const sameCol = cols.every((c) => c === cols[0]);

    return sameRow || sameCol;
  }

  private isPlacementContinuous(
    placements: Array<{ row: number; col: number; tile: WordsTile }>,
    board: BoardCell[][]
  ): boolean {
    if (placements.length <= 1) {
      return true;
    }

    const sameRow = placements.every((placement) => placement.row === placements[0]!.row);
    const occupiedByPlacement = new Set(
      placements.map((placement) => `${placement.row},${placement.col}`)
    );

    if (sameRow) {
      const row = placements[0]!.row;
      const cols = placements.map((placement) => placement.col).sort((a, b) => a - b);

      for (let col = cols[0]!; col <= cols[cols.length - 1]!; col++) {
        if (!occupiedByPlacement.has(`${row},${col}`) && !board[row]![col]!.tile) {
          return false;
        }
      }

      return true;
    }

    const col = placements[0]!.col;
    const rows = placements.map((placement) => placement.row).sort((a, b) => a - b);

    for (let row = rows[0]!; row <= rows[rows.length - 1]!; row++) {
      if (!occupiedByPlacement.has(`${row},${col}`) && !board[row]![col]!.tile) {
        return false;
      }
    }

    return true;
  }
  private connectsToExistingTiles(
    placements: Array<{ row: number; col: number; tile: WordsTile }>,
    board: BoardCell[][]
  ): boolean {
    for (const placement of placements) {
      // Check adjacent squares for existing tiles
      const adjacentPositions = [
        { row: placement.row - 1, col: placement.col },
        { row: placement.row + 1, col: placement.col },
        { row: placement.row, col: placement.col - 1 },
        { row: placement.row, col: placement.col + 1 },
      ];

      for (const pos of adjacentPositions) {
        if (this.isValidPosition(pos.row, pos.col) && board[pos.row]![pos.col]!.tile) {
          return true;
        }
      }
    }

    return false;
  }

  protected async applyMove(move: GameMove): Promise<void> {
    const wordsMove = move.moveData as WordsMove;
    const state = this.currentState as WordsState;

    if (wordsMove.action === 'pass') {
      state.passCount++;
      this.moveToNextPlayer(state);

      // Game ends if all players pass twice in a row
      if (state.passCount >= state.playerOrder.length * 2) {
        this.endGame(state);
      }
      return;
    }

    if (wordsMove.action === 'exchange') {
      this.exchangeTiles(wordsMove, state);
      this.moveToNextPlayer(state);
      return;
    }

    if (wordsMove.action === 'play') {
      const score = this.placeTilesAndScore(wordsMove, state);
      state.players[wordsMove.player]!.score += score;

      // Refill player's rack
      const player = state.players[wordsMove.player]!;
      const tilesToDraw = this.RACK_SIZE - player.rack.length;
      player.rack.push(...this.drawTiles(state.tileBag, tilesToDraw));

      state.passCount = 0; // Reset pass count
      state.firstMove = false;

      // Official-style finish: the game ends when a player uses their last tile and the bag is empty.
      if (player.rack.length === 0 && state.tileBag.length === 0) {
        this.endGame(state);
        return;
      }

      this.moveToNextPlayer(state);
    }
  }

  private exchangeTiles(move: WordsMove, state: WordsState): void {
    const player = state.players[move.player]!;
    const tilesToExchange = move.exchangeTiles!;

    for (const tile of tilesToExchange) {
      const tileKey = this.createTileKey(tile);
      const index = player.rack.findIndex((rackTile) => this.createTileKey(rackTile) === tileKey);
      if (index !== -1) {
        player.rack.splice(index, 1);
      }
    }

    const newTiles = this.drawTiles(state.tileBag, tilesToExchange.length);
    player.rack.push(...newTiles);

    state.tileBag.push(...tilesToExchange.map((tile) => ({ ...tile })));
    this.shuffleTiles(state.tileBag);
  }

  private placeTilesAndScore(move: WordsMove, state: WordsState): number {
    const placements = move.placements!;
    const player = state.players[move.player]!;
    const resolvedPlacements: Array<{ row: number; col: number; tile: WordsTile }> = [];

    for (const placement of placements) {
      const tileToPlace = this.resolvePlacementTile(placement);
      state.board[placement.row]![placement.col]!.tile = tileToPlace;

      const rackKey = this.createTileKey(placement.tile);
      const rackIndex = player.rack.findIndex(
        (rackTile) => this.createTileKey(rackTile) === rackKey
      );
      if (rackIndex !== -1) {
        player.rack.splice(rackIndex, 1);
      }

      resolvedPlacements.push({
        row: placement.row,
        col: placement.col,
        tile: tileToPlace,
      });
    }

    const formedWords = this.collectFormedWords(resolvedPlacements, state.board, state.firstMove);
    const score = this.calculateScore(resolvedPlacements, state.board, formedWords);

    state.lastMove = {
      playerId: move.player,
      words: formedWords.map(({ word }) => word),
      score,
      tilesPlaced: resolvedPlacements.map((placement) => ({
        row: placement.row,
        col: placement.col,
        tile: placement.tile,
      })),
    };

    return score;
  }

  private calculateScore(
    placements: Array<{ row: number; col: number; tile: WordsTile }>,
    board: BoardCell[][],
    formedWords = this.collectFormedWords(placements, board, false)
  ): number {
    const placementKeys = new Set(
      placements.map((placement) => `${placement.row},${placement.col}`)
    );
    let totalScore = 0;

    for (const formedWord of formedWords) {
      let wordScore = 0;
      let wordMultiplier = 1;

      for (const position of formedWord.positions) {
        const cell = board[position.row]![position.col]!;
        const tile = cell.tile!;
        let letterScore = tile.value;

        if (placementKeys.has(`${position.row},${position.col}`)) {
          if (cell.multiplier === 'DL') {
            letterScore *= 2;
          } else if (cell.multiplier === 'TL') {
            letterScore *= 3;
          }

          if (cell.multiplier === 'DW' || cell.multiplier === 'STAR') {
            wordMultiplier *= 2;
          } else if (cell.multiplier === 'TW') {
            wordMultiplier *= 3;
          }
        }

        wordScore += letterScore;
      }

      totalScore += wordScore * wordMultiplier;
    }

    if (placements.length === 7) {
      totalScore += 50;
    }

    return totalScore;
  }

  private collectFormedWords(
    placements: Array<{ row: number; col: number; tile: WordsTile }>,
    board: BoardCell[][],
    allowSingleLetterWord: boolean
  ): Array<{
    word: string;
    positions: Array<{ row: number; col: number }>;
    direction: 'horizontal' | 'vertical';
  }> {
    const words: Array<{
      word: string;
      positions: Array<{ row: number; col: number }>;
      direction: 'horizontal' | 'vertical';
    }> = [];
    const seen = new Set<string>();
    const primaryDirection = this.getPrimaryDirection(placements);

    if (placements.length === 1) {
      const placement = placements[0]!;
      const horizontalWord = this.readWordAt(placement.row, placement.col, board, 'horizontal');
      const verticalWord = this.readWordAt(placement.row, placement.col, board, 'vertical');

      this.addWordIfNew(words, seen, horizontalWord, false);
      this.addWordIfNew(words, seen, verticalWord, false);

      if (words.length === 0 && allowSingleLetterWord) {
        this.addWordIfNew(words, seen, horizontalWord, true);
      }

      return words;
    }

    if (primaryDirection) {
      this.addWordIfNew(
        words,
        seen,
        this.readWordAt(placements[0]!.row, placements[0]!.col, board, primaryDirection),
        allowSingleLetterWord
      );

      const perpendicularDirection = primaryDirection === 'horizontal' ? 'vertical' : 'horizontal';
      for (const placement of placements) {
        this.addWordIfNew(
          words,
          seen,
          this.readWordAt(placement.row, placement.col, board, perpendicularDirection),
          false
        );
      }
    }

    return words;
  }

  private addWordIfNew(
    words: Array<{
      word: string;
      positions: Array<{ row: number; col: number }>;
      direction: 'horizontal' | 'vertical';
    }>,
    seen: Set<string>,
    formedWord:
      | {
          word: string;
          positions: Array<{ row: number; col: number }>;
          direction: 'horizontal' | 'vertical';
        }
      | null,
    allowSingleLetterWord: boolean
  ): void {
    if (!formedWord) {
      return;
    }

    if (formedWord.positions.length === 1 && !allowSingleLetterWord) {
      return;
    }

    const first = formedWord.positions[0]!;
    const last = formedWord.positions[formedWord.positions.length - 1]!;
    const key = `${formedWord.direction}:${first.row},${first.col}:${last.row},${last.col}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    words.push(formedWord);
  }

  private getPrimaryDirection(
    placements: Array<{ row: number; col: number; tile: WordsTile }>
  ): 'horizontal' | 'vertical' | null {
    if (placements.length <= 1) {
      return null;
    }

    if (placements.every((placement) => placement.row === placements[0]!.row)) {
      return 'horizontal';
    }

    if (placements.every((placement) => placement.col === placements[0]!.col)) {
      return 'vertical';
    }

    return null;
  }

  private readWordAt(
    row: number,
    col: number,
    board: BoardCell[][],
    direction: 'horizontal' | 'vertical'
  ):
    | {
        word: string;
        positions: Array<{ row: number; col: number }>;
        direction: 'horizontal' | 'vertical';
      }
    | null {
    if (!board[row]![col]!.tile) {
      return null;
    }

    const rowDelta = direction === 'vertical' ? 1 : 0;
    const colDelta = direction === 'horizontal' ? 1 : 0;

    let startRow = row;
    let startCol = col;

    while (
      this.isValidPosition(startRow - rowDelta, startCol - colDelta) &&
      board[startRow - rowDelta]![startCol - colDelta]!.tile
    ) {
      startRow -= rowDelta;
      startCol -= colDelta;
    }

    const positions: Array<{ row: number; col: number }> = [];
    let word = '';
    let currentRow = startRow;
    let currentCol = startCol;

    while (this.isValidPosition(currentRow, currentCol) && board[currentRow]![currentCol]!.tile) {
      positions.push({ row: currentRow, col: currentCol });
      word += board[currentRow]![currentCol]!.tile!.letter;
      currentRow += rowDelta;
      currentCol += colDelta;
    }

    return {
      word,
      positions,
      direction,
    };
  }

  private isValidWord(word: string): boolean {
    return this.activeLexicon.has(word.toUpperCase());
  }
  private moveToNextPlayer(state: WordsState): void {
    const currentIndex = state.playerOrder.indexOf(state.currentPlayer);
    const nextIndex = (currentIndex + 1) % state.playerOrder.length;
    state.currentPlayer = state.playerOrder[nextIndex]!;
  }

  private endGame(state: WordsState): void {
    state.gameOver = true;
    state.gamePhase = 'finished';

    // Determine winner by highest score
    let highestScore = 0;
    let winners: string[] = [];

    for (const [playerId, player] of Object.entries(state.players)) {
      if (player.score > highestScore) {
        highestScore = player.score;
        winners = [playerId];
      } else if (player.score === highestScore) {
        winners.push(playerId);
      }
    }

    // For simplicity, first player wins ties
    state.winner = winners[0]!;
  }

  async getGameState(): Promise<GameState> {
    const state = this.currentState as WordsState;

    // Hide tile bag contents but show count
    const sanitizedPlayers: any = {};
    for (const [playerId, player] of Object.entries(state.players)) {
      sanitizedPlayers[playerId] = {
        rackSize: player.rack.length,
        score: player.score,
      };
    }

    return {
      gameId: this.gameId,
      gameType: this.gameType,
      currentPlayer: state.currentPlayer,
      gameOver: state.gameOver,
      winner: state.winner,
      board: state.board,
      players: sanitizedPlayers,
      playerOrder: state.playerOrder,
      passCount: state.passCount,
      lastMove: state.lastMove,
      gamePhase: state.gamePhase,
      firstMove: state.firstMove,
      lexicon: this.getStateLexicon(state),
      tileBagSize: state.tileBag.length,
    };
  }

  async isGameOver(): Promise<boolean> {
    const state = this.currentState as WordsState;
    return state.gameOver;
  }

  async getWinner(): Promise<string | null> {
    const state = this.currentState as WordsState;
    return state.winner;
  }

  getMetadata(): GameMetadata {
    return {
      name: 'Word Tiles',
      description:
        'Classic word-building game where players create words on a board using letter tiles',
      minPlayers: 2,
      maxPlayers: 4,
      estimatedDuration: '60-90 minutes',
      complexity: 'intermediate',
      categories: ['word', 'strategy', 'vocabulary', 'tiles'],
    };
  }
}

export function createWordTilesGame(
  gameId: string,
  database: import('@versus/game-core').DatabaseProvider = new InMemoryDatabaseProvider()
): WordTilesGame {
  return new WordTilesGame(gameId, database);
}



