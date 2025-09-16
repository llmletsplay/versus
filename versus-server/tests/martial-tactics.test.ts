import { MartialTacticsGame } from '../src/games/martial-tactics.js';

describe('MartialTacticsGame', () => {
  let game: MartialTacticsGame;

  beforeEach(() => {
    game = new MartialTacticsGame('test-game-id');
  });

  describe('Game Initialization', () => {
    test('should initialize with correct board setup', async () => {
      const state = await game.initializeGame();

      expect(state.gameType).toBe('martial-tactics');
      expect(state.currentPlayer).toBe('red');
      expect(state.gameOver).toBe(false);
      expect(state.winner).toBeNull();
      expect(state.moveCount).toBe(0);

      // Check board setup
      expect(state.board).toHaveLength(5);
      expect(state.board[0]).toHaveLength(5);

      // Check red pieces (bottom row)
      expect(state.board[4][0]).toEqual({ player: 'red', type: 'student' });
      expect(state.board[4][1]).toEqual({ player: 'red', type: 'student' });
      expect(state.board[4][2]).toEqual({ player: 'red', type: 'master' });
      expect(state.board[4][3]).toEqual({ player: 'red', type: 'student' });
      expect(state.board[4][4]).toEqual({ player: 'red', type: 'student' });

      // Check blue pieces (top row)
      expect(state.board[0][0]).toEqual({ player: 'blue', type: 'student' });
      expect(state.board[0][1]).toEqual({ player: 'blue', type: 'student' });
      expect(state.board[0][2]).toEqual({ player: 'blue', type: 'master' });
      expect(state.board[0][3]).toEqual({ player: 'blue', type: 'student' });
      expect(state.board[0][4]).toEqual({ player: 'blue', type: 'student' });

      // Check cards
      expect(state.playerCards.red).toHaveLength(2);
      expect(state.playerCards.blue).toHaveLength(2);
      expect(state.neutralCard).toBeDefined();
    });
  });

  describe('Move Validation', () => {
    beforeEach(async () => {
      await game.initializeGame();
    });

    test('should validate basic move requirements', async () => {
      const result = await game.validateMove({
        from: { row: 4, col: 0 },
        to: { row: 3, col: 0 },
        cardName: 'Tiger',
        player: 'red',
      });

      // Result depends on whether red player has Tiger card
      expect(typeof result.valid).toBe('boolean');
    });

    test('should reject move with missing data', async () => {
      const result = await game.validateMove({
        from: { row: 4, col: 0 },
        // Missing to, cardName, player
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Move must include from, to, cardName, and player');
    });

    test('should reject move for wrong player', async () => {
      const state = await game.getGameState();
      const blueCard = state.playerCards.blue[0].name;

      const result = await game.validateMove({
        from: { row: 4, col: 0 },
        to: { row: 3, col: 0 },
        cardName: blueCard,
        player: 'blue',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("It's red's turn");
    });

    test('should reject move with invalid coordinates', async () => {
      const state = await game.getGameState();
      const redCard = state.playerCards.red[0].name;

      const result = await game.validateMove({
        from: { row: -1, col: 0 },
        to: { row: 3, col: 0 },
        cardName: redCard,
        player: 'red',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('within board bounds');
    });

    test('should reject move from empty position', async () => {
      const state = await game.getGameState();
      const redCard = state.playerCards.red[0].name;

      const result = await game.validateMove({
        from: { row: 2, col: 2 }, // Empty middle position
        to: { row: 1, col: 2 },
        cardName: redCard,
        player: 'red',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('No piece of yours at from position');
    });

    test('should reject capturing own piece', async () => {
      const state = await game.getGameState();
      const redCard = state.playerCards.red[0].name;

      const result = await game.validateMove({
        from: { row: 4, col: 0 },
        to: { row: 4, col: 1 }, // Another red piece
        cardName: redCard,
        player: 'red',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Cannot capture your own piece');
    });
  });

  describe('Game Metadata', () => {
    test('should return correct metadata', () => {
      const metadata = game.getMetadata();

      expect(metadata.name).toBe('Martial Tactics');
      expect(metadata.description).toContain('Onitama');
      expect(metadata.minPlayers).toBe(2);
      expect(metadata.maxPlayers).toBe(2);
      expect(metadata.complexity).toBe('intermediate');
      expect(metadata.categories).toContain('strategy');
      expect(metadata.categories).toContain('martial arts');
    });
  });

  describe('Game State', () => {
    test('should track game state correctly', async () => {
      await game.initializeGame();

      const gameOver = await game.isGameOver();
      expect(gameOver).toBe(false);

      const winner = await game.getWinner();
      expect(winner).toBeNull();
    });
  });
});
