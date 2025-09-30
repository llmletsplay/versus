import { BaseGame } from '../core/base-game.js';
import type {
  GameState,
  GameConfig,
  MoveValidationResult,
  GameMetadata,
  GameMove,
} from '../types/game.js';
import { DatabaseProvider } from '../core/database.js';

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

interface WordsState extends GameState {
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
}

interface WordsMove {
  player: string;
  action: 'play' | 'pass' | 'exchange';
  placements?: Array<{ row: number; col: number; tile: WordsTile; letter?: TileLetter }>; // letter for blank tiles
  exchangeTiles?: WordsTile[]; // For exchange action
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

  // Expanded word list for better validation
  private readonly VALID_WORDS = new Set([
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

  constructor(gameId: string, database: DatabaseProvider) {
    super(gameId, 'word-tiles', database);
    this.initializePremiumSquares();
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
    const playerCount = Math.min(Math.max((config as any)?.playerCount || 2, 2), 4);
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

  async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
    try {
      const move = moveData as WordsMove;

      if (!move.player || !move.action) {
        return { valid: false, error: 'Move must include player and action' };
      }

      const state = this.currentState as WordsState;

      if (state.gameOver) {
        return { valid: false, error: 'Game is already over' };
      }

      if (move.player !== state.currentPlayer) {
        return { valid: false, error: 'Not your turn' };
      }

      if (!state.players[move.player]) {
        return { valid: false, error: 'Invalid player' };
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

        // Verify player has the tiles they want to exchange
        const playerRack = state.players[move.player]!.rack;
        for (const tile of move.exchangeTiles) {
          const hasThisTile = playerRack.some(
            rackTile => rackTile.letter === tile.letter && rackTile.value === tile.value
          );
          if (!hasThisTile) {
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

    // Verify player has all the tiles they're trying to place
    for (const placement of placements) {
      const hasThisTile = playerRack.some(
        rackTile =>
          rackTile.letter === placement.tile.letter && rackTile.value === placement.tile.value
      );
      if (!hasThisTile) {
        return {
          valid: false,
          error: 'You do not have one or more of the tiles you are trying to place',
        };
      }
    }

    // Verify all placements are on empty squares
    for (const placement of placements) {
      if (!this.isValidPosition(placement.row, placement.col)) {
        return { valid: false, error: 'Invalid board position' };
      }

      if (state.board[placement.row]![placement.col]!.tile) {
        return { valid: false, error: 'Cannot place tile on occupied square' };
      }
    }

    // Verify tiles are placed in a line (horizontal or vertical)
    if (!this.areTilesInLine(placements)) {
      return { valid: false, error: 'All tiles must be placed in a single row or column' };
    }

    // First move must cover the center star
    if (state.firstMove) {
      const coversStar = placements.some(p => p.row === 7 && p.col === 7);
      if (!coversStar) {
        return { valid: false, error: 'First move must cover the center star' };
      }
    } else {
      // Subsequent moves must connect to existing tiles
      if (!this.connectsToExistingTiles(placements, state.board)) {
        return { valid: false, error: 'New tiles must connect to existing tiles on the board' };
      }
    }

    return { valid: true };
  }

  private isValidPosition(row: number, col: number): boolean {
    return row >= 0 && row < this.BOARD_SIZE && col >= 0 && col < this.BOARD_SIZE;
  }

  private areTilesInLine(
    placements: Array<{ row: number; col: number; tile: WordsTile }>
  ): boolean {
    if (placements.length === 1) {
      return true;
    }

    const rows = placements.map(p => p.row);
    const cols = placements.map(p => p.col);

    const sameRow = rows.every(r => r === rows[0]);
    const sameCol = cols.every(c => c === cols[0]);

    return sameRow || sameCol;
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

      // Check for game end conditions
      if (player.rack.length === 0 || state.tileBag.length === 0) {
        this.endGame(state);
        return;
      }

      this.moveToNextPlayer(state);
    }
  }

  private exchangeTiles(move: WordsMove, state: WordsState): void {
    const player = state.players[move.player]!;
    const tilesToExchange = move.exchangeTiles!;

    // Remove tiles from player's rack
    for (const tile of tilesToExchange) {
      const index = player.rack.findIndex(
        rackTile => rackTile.letter === tile.letter && rackTile.value === tile.value
      );
      if (index !== -1) {
        player.rack.splice(index, 1);
      }
    }

    // Draw new tiles
    const newTiles = this.drawTiles(state.tileBag, tilesToExchange.length);
    player.rack.push(...newTiles);

    // Return exchanged tiles to bag and shuffle
    state.tileBag.push(...tilesToExchange);
    this.shuffleTiles(state.tileBag);
  }

  private placeTilesAndScore(move: WordsMove, state: WordsState): number {
    const placements = move.placements!;
    const player = state.players[move.player]!;

    // Place tiles on board
    for (const placement of placements) {
      // Handle blank tiles
      let tileToPlace = placement.tile;
      if (placement.tile.isBlank && placement.letter) {
        tileToPlace = {
          ...placement.tile,
          letter: placement.letter,
        };
      }

      state.board[placement.row]![placement.col]!.tile = tileToPlace;

      // Remove tile from player's rack
      const rackIndex = player.rack.findIndex(
        rackTile =>
          rackTile.letter === placement.tile.letter && rackTile.value === placement.tile.value
      );
      if (rackIndex !== -1) {
        player.rack.splice(rackIndex, 1);
      }
    }

    // Calculate score
    const score = this.calculateScore(placements, state.board);

    // Record the move
    const words = this.getFormedWords(placements, state.board);
    state.lastMove = {
      playerId: move.player,
      words,
      score,
      tilesPlaced: placements.map(p => ({ row: p.row, col: p.col, tile: p.tile })),
    };

    return score;
  }

  private calculateScore(
    placements: Array<{ row: number; col: number; tile: WordsTile }>,
    board: BoardCell[][]
  ): number {
    let totalScore = 0;
    let wordMultiplier = 1;

    // Calculate main word score
    for (const placement of placements) {
      let letterScore = placement.tile.value;
      const cell = board[placement.row]![placement.col]!;

      // Apply letter multipliers
      if (cell.multiplier === 'DL') {
        letterScore *= 2;
      } else if (cell.multiplier === 'TL') {
        letterScore *= 3;
      }

      // Apply word multipliers
      if (cell.multiplier === 'DW' || cell.multiplier === 'STAR') {
        wordMultiplier *= 2;
      } else if (cell.multiplier === 'TW') {
        wordMultiplier *= 3;
      }

      totalScore += letterScore;
    }

    totalScore *= wordMultiplier;

    // Bonus for using all 7 tiles (bingo)
    if (placements.length === 7) {
      totalScore += 50;
    }

    return totalScore;
  }

  private getFormedWords(
    placements: Array<{ row: number; col: number; tile: WordsTile }>,
    board: BoardCell[][]
  ): string[] {
    const words: string[] = [];

    if (placements.length === 0) {
      return words;
    }

    // Sort placements to determine direction
    const sortedPlacements = [...placements].sort((a, b) => {
      if (a.row !== b.row) {
        return a.row - b.row;
      }
      return a.col - b.col;
    });

    const isHorizontal = sortedPlacements.every(p => p.row === sortedPlacements[0]!.row);

    if (isHorizontal) {
      // Find the main horizontal word
      const row = sortedPlacements[0]!.row;
      const startCol = this.findWordStart(row, sortedPlacements[0]!.col, board, 'horizontal');
      const endCol = this.findWordEnd(
        row,
        sortedPlacements[sortedPlacements.length - 1]!.col,
        board,
        'horizontal'
      );

      if (endCol > startCol) {
        const word = this.extractWord(row, startCol, endCol, board, 'horizontal');
        if (word.length > 1) {
          words.push(word);
        }
      }

      // Check for perpendicular words formed by each placement
      for (const placement of placements) {
        const startRow = this.findWordStart(placement.row, placement.col, board, 'vertical');
        const endRow = this.findWordEnd(placement.row, placement.col, board, 'vertical');

        if (endRow > startRow) {
          const word = this.extractWord(startRow, placement.col, endRow, board, 'vertical');
          if (word.length > 1) {
            words.push(word);
          }
        }
      }
    } else {
      // Find the main vertical word
      const col = sortedPlacements[0]!.col;
      const startRow = this.findWordStart(sortedPlacements[0]!.row, col, board, 'vertical');
      const endRow = this.findWordEnd(
        sortedPlacements[sortedPlacements.length - 1]!.row,
        col,
        board,
        'vertical'
      );

      if (endRow > startRow) {
        const word = this.extractWord(startRow, col, endRow, board, 'vertical');
        if (word.length > 1) {
          words.push(word);
        }
      }

      // Check for perpendicular words formed by each placement
      for (const placement of placements) {
        const startCol = this.findWordStart(placement.row, placement.col, board, 'horizontal');
        const endCol = this.findWordEnd(placement.row, placement.col, board, 'horizontal');

        if (endCol > startCol) {
          const word = this.extractWord(placement.row, startCol, endCol, board, 'horizontal');
          if (word.length > 1) {
            words.push(word);
          }
        }
      }
    }

    return words;
  }

  private findWordStart(
    row: number,
    col: number,
    board: BoardCell[][],
    direction: 'horizontal' | 'vertical'
  ): number {
    if (direction === 'horizontal') {
      while (col > 0 && board[row]![col - 1]!.tile) {
        col--;
      }
    } else {
      while (row > 0 && board[row - 1]![col]!.tile) {
        row--;
      }
    }
    return direction === 'horizontal' ? col : row;
  }

  private findWordEnd(
    row: number,
    col: number,
    board: BoardCell[][],
    direction: 'horizontal' | 'vertical'
  ): number {
    if (direction === 'horizontal') {
      while (col < this.BOARD_SIZE - 1 && board[row]![col + 1]!.tile) {
        col++;
      }
    } else {
      while (row < this.BOARD_SIZE - 1 && board[row + 1]![col]!.tile) {
        row++;
      }
    }
    return direction === 'horizontal' ? col : row;
  }

  private extractWord(
    row: number,
    startPos: number,
    endPos: number,
    board: BoardCell[][],
    direction: 'horizontal' | 'vertical'
  ): string {
    let word = '';

    if (direction === 'horizontal') {
      for (let col = startPos; col <= endPos; col++) {
        const tile = board[row]![col]!.tile;
        if (tile) {
          word += tile.letter === '_' ? 'A' : tile.letter; // Blank tiles default to 'A' for word formation
        }
      }
    } else {
      for (let r = startPos; r <= endPos; r++) {
        const tile = board[r]![row]!.tile;
        if (tile) {
          word += tile.letter === '_' ? 'A' : tile.letter; // Blank tiles default to 'A' for word formation
        }
      }
    }

    return word;
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
