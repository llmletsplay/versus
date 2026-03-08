import { GoGame } from '../src/games/go.js';

// Helper function to access internal state
function getInternalState(game: any): any {
  return game.currentState;
}

describe('GoGame', () => {
  let game: GoGame;

  beforeEach(() => {
    game = new GoGame('test-game-id');
  });

  describe('initializeGame', () => {
    it('should initialize game with default 19x19 board', async () => {
      const state = await game.initializeGame();
      expect(state.board.length).toBe(19);
      expect(state.board[0]!.length).toBe(19);
      expect(state.currentPlayer).toBe('black');
      expect(state.gameOver).toBe(false);
      expect(state.winner).toBeNull();
      expect(state.capturedStones).toEqual({ black: 0, white: 0 });
      expect(state.passCount).toBe(0);
      expect(state.koPosition).toBeNull();
      expect(state.gamePhase).toBe('playing');
      expect(state.komi).toBe(6.5);
    });

    it('should initialize game with custom board size', async () => {
      const state = await game.initializeGame({ boardSize: 9 });
      expect(state.board.length).toBe(9);
      expect(state.board[0]!.length).toBe(9);
    });

    it('should place handicap stones correctly', async () => {
      const state = await game.initializeGame({ handicap: 4 });
      const internalState = getInternalState(game);

      // Check corner positions for handicap stones
      expect(internalState.board[3][3]).toBe('black');
      expect(internalState.board[3][15]).toBe('black');
      expect(internalState.board[15][3]).toBe('black');
      expect(internalState.board[15][15]).toBe('black');

      // White should play first after handicap
      expect(state.currentPlayer).toBe('white');
    });
  });

  describe('validateMove', () => {
    beforeEach(async () => {
      await game.initializeGame({ boardSize: 9 });
    });

    it('should validate valid place move', async () => {
      const result = await game.validateMove({
        player: 'black',
        action: 'place',
        row: 4,
        col: 4,
      });
      expect(result.valid).toBe(true);
    });

    it('should reject move on occupied position', async () => {
      await game.makeMove({
        player: 'black',
        action: 'place',
        row: 4,
        col: 4,
      });

      const result = await game.validateMove({
        player: 'white',
        action: 'place',
        row: 4,
        col: 4,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Position is already occupied');
    });

    it('should reject move out of bounds', async () => {
      const result = await game.validateMove({
        player: 'black',
        action: 'place',
        row: 9,
        col: 9,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Move coordinates out of bounds');
    });

    it('should reject move when not player turn', async () => {
      const result = await game.validateMove({
        player: 'white',
        action: 'place',
        row: 4,
        col: 4,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("It's black's turn");
    });

    it('should validate pass move', async () => {
      const result = await game.validateMove({
        player: 'black',
        action: 'pass',
      });
      expect(result.valid).toBe(true);
    });

    it('should validate resign move', async () => {
      const result = await game.validateMove({
        player: 'black',
        action: 'resign',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('stone placement and captures', () => {
    beforeEach(async () => {
      await game.initializeGame({ boardSize: 9 });
    });

    it('should place stones correctly', async () => {
      await game.makeMove({
        player: 'black',
        action: 'place',
        row: 4,
        col: 4,
      });

      const state = await game.getGameState();
      expect(state.board[4]![4]).toBe('black');
      expect(state.currentPlayer).toBe('white');
    });

    it('should capture single stone', async () => {
      // Black plays
      await game.makeMove({ player: 'black', action: 'place', row: 4, col: 4 });
      // White surrounds black stone
      await game.makeMove({ player: 'white', action: 'place', row: 3, col: 4 });
      await game.makeMove({ player: 'black', action: 'place', row: 0, col: 0 });
      await game.makeMove({ player: 'white', action: 'place', row: 5, col: 4 });
      await game.makeMove({ player: 'black', action: 'place', row: 0, col: 1 });
      await game.makeMove({ player: 'white', action: 'place', row: 4, col: 3 });
      await game.makeMove({ player: 'black', action: 'place', row: 0, col: 2 });
      // White captures black stone
      await game.makeMove({ player: 'white', action: 'place', row: 4, col: 5 });

      const state = await game.getGameState();
      expect(state.board[4]![4]).toBeNull(); // Black stone captured
      expect(state.capturedStones.black).toBe(1);
    });

    it('should capture group of stones', async () => {
      // Create a simple black group with two stones
      await game.makeMove({ player: 'black', action: 'place', row: 4, col: 4 });
      await game.makeMove({ player: 'white', action: 'place', row: 3, col: 4 });
      await game.makeMove({ player: 'black', action: 'place', row: 4, col: 5 });
      await game.makeMove({ player: 'white', action: 'place', row: 5, col: 4 });
      await game.makeMove({ player: 'black', action: 'pass' });
      await game.makeMove({ player: 'white', action: 'place', row: 4, col: 3 });
      await game.makeMove({ player: 'black', action: 'pass' });
      await game.makeMove({ player: 'white', action: 'place', row: 5, col: 5 });
      await game.makeMove({ player: 'black', action: 'pass' });
      await game.makeMove({ player: 'white', action: 'place', row: 3, col: 5 });
      await game.makeMove({ player: 'black', action: 'pass' });
      // Capture the group
      await game.makeMove({ player: 'white', action: 'place', row: 4, col: 6 });

      const state = await game.getGameState();
      expect(state.board[4]![4]).toBeNull();
      expect(state.board[4]![5]).toBeNull();
      expect(state.capturedStones.black).toBe(2);
    });

    it('should reject suicide move', async () => {
      // White surrounds a position
      await game.makeMove({ player: 'black', action: 'pass' });
      await game.makeMove({ player: 'white', action: 'place', row: 3, col: 4 });
      await game.makeMove({ player: 'black', action: 'pass' });
      await game.makeMove({ player: 'white', action: 'place', row: 5, col: 4 });
      await game.makeMove({ player: 'black', action: 'pass' });
      await game.makeMove({ player: 'white', action: 'place', row: 4, col: 3 });
      await game.makeMove({ player: 'black', action: 'pass' });
      await game.makeMove({ player: 'white', action: 'place', row: 4, col: 5 });

      // Black tries suicide move
      const result = await game.validateMove({
        player: 'black',
        action: 'place',
        row: 4,
        col: 4,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Suicide move not allowed');
    });

    it('should allow suicide move that captures opponent stones', async () => {
      // Create a situation where black can capture by playing a "suicide" move
      await game.makeMove({ player: 'black', action: 'place', row: 3, col: 4 });
      await game.makeMove({ player: 'white', action: 'place', row: 4, col: 4 });
      await game.makeMove({ player: 'black', action: 'place', row: 5, col: 4 });
      await game.makeMove({ player: 'white', action: 'place', row: 4, col: 5 });
      await game.makeMove({ player: 'black', action: 'place', row: 4, col: 3 });
      await game.makeMove({ player: 'white', action: 'pass' });
      await game.makeMove({ player: 'black', action: 'place', row: 3, col: 5 });
      await game.makeMove({ player: 'white', action: 'pass' });
      await game.makeMove({ player: 'black', action: 'place', row: 5, col: 5 });
      await game.makeMove({ player: 'white', action: 'pass' });

      // Black can play at (4, 6) to capture white stones
      const result = await game.validateMove({
        player: 'black',
        action: 'place',
        row: 4,
        col: 6,
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('ko rule', () => {
    beforeEach(async () => {
      await game.initializeGame({ boardSize: 9 });
    });

    it('should prevent immediate recapture (ko rule)', async () => {
      // Test ko position mechanism directly
      const state = getInternalState(game);

      // Manually set up a ko position
      state.koPosition = { row: 4, col: 4 };
      state.currentPlayer = 'black';

      // Black cannot play at ko position
      const result = await game.validateMove({
        player: 'black',
        action: 'place',
        row: 4,
        col: 4,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Ko rule violation - cannot immediately recapture');

      // But can play elsewhere
      const validResult = await game.validateMove({
        player: 'black',
        action: 'place',
        row: 0,
        col: 0,
      });
      expect(validResult.valid).toBe(true);
    });

  });

  describe('game ending', () => {
    beforeEach(async () => {
      await game.initializeGame({ boardSize: 9 });
    });

    it('should end game after two consecutive passes', async () => {
      await game.makeMove({ player: 'black', action: 'pass' });
      expect((await game.getGameState()).gameOver).toBe(false);

      await game.makeMove({ player: 'white', action: 'pass' });

      const state = await game.getGameState();
      expect(state.gameOver).toBe(true);
      expect(state.gamePhase).toBe('finished');
    });

    it('should end game on resignation', async () => {
      await game.makeMove({ player: 'black', action: 'resign' });

      const state = await game.getGameState();
      expect(state.gameOver).toBe(true);
      expect(state.winner).toBe('white');
      expect(state.gamePhase).toBe('finished');
    });

    it('should calculate territory correctly', async () => {
      // Create a simple territory
      await game.makeMove({ player: 'black', action: 'place', row: 3, col: 0 });
      await game.makeMove({ player: 'white', action: 'place', row: 3, col: 8 });
      await game.makeMove({ player: 'black', action: 'place', row: 3, col: 1 });
      await game.makeMove({ player: 'white', action: 'place', row: 3, col: 7 });
      await game.makeMove({ player: 'black', action: 'place', row: 3, col: 2 });
      await game.makeMove({ player: 'white', action: 'place', row: 3, col: 6 });
      await game.makeMove({ player: 'black', action: 'place', row: 3, col: 3 });
      await game.makeMove({ player: 'white', action: 'place', row: 3, col: 5 });
      await game.makeMove({ player: 'black', action: 'place', row: 3, col: 4 });

      // Create vertical walls
      await game.makeMove({ player: 'white', action: 'pass' });

      for (let i = 0; i < 3; i++) {
        await game.makeMove({ player: 'black', action: 'place', row: i, col: 4 });
        if (i < 2 || !(await game.isGameOver())) {
          await game.makeMove({ player: 'white', action: 'place', row: i, col: 5 });
        }
      }

      for (let i = 4; i < 9 && !(await game.isGameOver()); i++) {
        await game.makeMove({ player: 'black', action: 'place', row: i, col: 4 });
        if (i < 8 || !(await game.isGameOver())) {
          await game.makeMove({ player: 'white', action: 'place', row: i, col: 5 });
        }
      }

      // End game with two passes
      if (!(await game.isGameOver())) {
        const currentState = await game.getGameState();
        await game.makeMove({ player: currentState.currentPlayer, action: 'pass' });

        if (!(await game.isGameOver())) {
          const nextState = await game.getGameState();
          await game.makeMove({ player: nextState.currentPlayer, action: 'pass' });
        }
      }

      const state = await game.getGameState();
      expect(state.territory.black).toBeGreaterThan(0);
      expect(state.territory.white).toBeGreaterThan(0);
    });

    it('should determine winner based on territory and captures', async () => {
      // Simple game with clear territories
      await game.makeMove({ player: 'black', action: 'place', row: 0, col: 0 });
      await game.makeMove({ player: 'white', action: 'place', row: 8, col: 8 });
      await game.makeMove({ player: 'black', action: 'pass' });
      await game.makeMove({ player: 'white', action: 'pass' });

      const state = await game.getGameState();
      expect(state.gameOver).toBe(true);
      expect(state.winner).not.toBeNull();
    });
  });

  describe('move history', () => {
    beforeEach(async () => {
      await game.initializeGame({ boardSize: 9 });
    });

    it('should track move history', async () => {
      await game.makeMove({ player: 'black', action: 'place', row: 4, col: 4 });
      await game.makeMove({ player: 'white', action: 'place', row: 3, col: 3 });
      await game.makeMove({ player: 'black', action: 'pass' });

      const state = await game.getGameState();
      expect(state.moveHistory).toHaveLength(3);
      expect(state.moveHistory[0]).toEqual({
        player: 'black',
        row: 4,
        col: 4,
        action: 'place',
        capturedStones: 0,
      });
      expect(state.moveHistory[1]).toEqual({
        player: 'white',
        row: 3,
        col: 3,
        action: 'place',
        capturedStones: 0,
      });
      expect(state.moveHistory[2]).toEqual({
        player: 'black',
        action: 'pass',
        capturedStones: 0,
      });
    });
  });

  describe('getMetadata', () => {
    it('should return correct metadata', () => {
      const metadata = game.getMetadata();
      expect(metadata.name).toBe('Go');
      expect(metadata.minPlayers).toBe(2);
      expect(metadata.maxPlayers).toBe(2);
      expect(metadata.complexity).toBe('advanced');
    });
  });

  describe('edge cases', () => {
    beforeEach(async () => {
      await game.initializeGame({ boardSize: 9 });
    });

    it('should handle invalid move data', async () => {
      const result = await game.validateMove({
        player: 'black',
        action: 'invalid',
      } as any);
      expect(result.valid).toBe(false);
    });

    it('should handle missing required fields', async () => {
      const result = await game.validateMove({
        player: 'black',
      } as any);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Move must include player and action');
    });

    it('should handle place move without coordinates', async () => {
      const result = await game.validateMove({
        player: 'black',
        action: 'place',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Row and col must be numbers for place action');
    });

    it('should handle game over state', async () => {
      await game.makeMove({ player: 'black', action: 'resign' });

      const result = await game.validateMove({
        player: 'white',
        action: 'place',
        row: 0,
        col: 0,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Game is already over');
    });
  });
});

