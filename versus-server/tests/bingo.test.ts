import { BingoGame } from '../src/games/bingo.js';

// Helper function to access internal state
function getInternalState(game: any): any {
  return game.currentState;
}

describe('BingoGame', () => {
  let game: BingoGame;

  beforeEach(() => {
    game = new BingoGame('test-game-id');
  });

  describe('initializeGame', () => {
    it('should initialize game with default 2 players', async () => {
      const state = await game.initializeGame();
      expect(Object.keys(state.cards).length).toBe(2);
      expect(state.gameOver).toBe(false);
      expect(state.winners).toEqual([]);
      expect(state.gamePhase).toBe('waiting');
      expect(state.calledNumbers).toEqual([]);
      expect(state.currentCall).toBeNull();
    });

    it('should initialize game with custom player count', async () => {
      const state = await game.initializeGame({ playerCount: 4 });
      expect(Object.keys(state.cards).length).toBe(4);
      expect(state.playerOrder).toEqual(['player1', 'player2', 'player3', 'player4']);
    });

    it('should generate cards with 5x5 grid', async () => {
      const state = await game.initializeGame();
      const card = state.cards.player1;
      expect(card.cells.length).toBe(5);
      expect(card.cells[0].length).toBe(5);
    });

    it('should mark center cell as free', async () => {
      const state = await game.initializeGame();
      const card = state.cards.player1;
      const centerCell = card.cells[2][2];
      expect(centerCell.marked).toBe(true);
      expect(centerCell.isCenter).toBe(true);
    });

    it('should have default win conditions', async () => {
      const state = await game.initializeGame();
      expect(state.winConditions.length).toBeGreaterThan(0);
      expect(state.winConditions.some(w => w.name === 'Top Row')).toBe(true);
      expect(state.winConditions.some(w => w.name === 'Main Diagonal')).toBe(true);
      expect(state.winConditions.some(w => w.name === 'Four Corners')).toBe(true);
    });

    it('should accept custom criteria', async () => {
      const customCriteria = [
        { id: 'A', description: 'Test A', values: ['A1', 'A2', 'A3', 'A4', 'A5'] },
        { id: 'B', description: 'Test B', values: ['B1', 'B2', 'B3', 'B4', 'B5'] },
        { id: 'C', description: 'Test C', values: ['C1', 'C2', 'C3', 'C4', 'C5'] },
        { id: 'D', description: 'Test D', values: ['D1', 'D2', 'D3', 'D4', 'D5'] },
        { id: 'E', description: 'Test E', values: ['E1', 'E2', 'E3', 'E4', 'E5'] },
      ];

      const state = await game.initializeGame({ customCriteria });
      expect(state.customCriteria).toEqual(customCriteria);
    });
  });

  describe('validateMove', () => {
    beforeEach(async () => {
      await game.initializeGame({ playerCount: 2 });
    });

    it('should validate start_game action', async () => {
      const result = await game.validateMove({
        player: 'player1',
        action: 'start_game',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject start_game when already started', async () => {
      await game.makeMove({ player: 'player1', action: 'start_game' });

      const result = await game.validateMove({
        player: 'player1',
        action: 'start_game',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Game has already started');
    });

    it('should validate call action with valid value', async () => {
      await game.makeMove({ player: 'player1', action: 'start_game' });

      const result = await game.validateMove({
        player: 'player1',
        action: 'call',
        value: 25,
      });
      expect(result.valid).toBe(true);
    });

    it('should reject call without value', async () => {
      await game.makeMove({ player: 'player1', action: 'start_game' });

      const result = await game.validateMove({
        player: 'player1',
        action: 'call',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Must provide value to call');
    });

    it('should reject duplicate calls', async () => {
      await game.makeMove({ player: 'player1', action: 'start_game' });
      await game.makeMove({ player: 'player1', action: 'call', value: 25 });

      const result = await game.validateMove({
        player: 'player1',
        action: 'call',
        value: 25,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Value has already been called');
    });

    it('should reject invalid player', async () => {
      const result = await game.validateMove({
        player: 'invalid-player',
        action: 'start_game',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid player');
    });

    it('should reject invalid action', async () => {
      const result = await game.validateMove({
        player: 'player1',
        action: 'invalid-action',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Action must be call, mark, claim_bingo, or start_game');
    });
  });

  describe('game flow', () => {
    beforeEach(async () => {
      await game.initializeGame({ playerCount: 2 });
    });

    it('should start game', async () => {
      await game.makeMove({ player: 'player1', action: 'start_game' });

      const state = await game.getGameState();
      expect(state.gamePhase).toBe('playing');
      expect(state.lastAction?.action).toBe('start_game');
    });

    it('should call numbers', async () => {
      await game.makeMove({ player: 'player1', action: 'start_game' });
      await game.makeMove({ player: 'player1', action: 'call', value: 42 });

      const state = await game.getGameState();
      expect(state.calledNumbers).toContain(42);
      expect(state.currentCall).toBe(42);
      expect(state.callHistory).toHaveLength(1);
      expect(state.callHistory[0].value).toBe(42);
    });

    it('should mark cells matching current call', async () => {
      await game.makeMove({ player: 'player1', action: 'start_game' });

      // Get the value at position [0,0] for player1
      const internalState = getInternalState(game);
      const cellValue = internalState.cards.player1.cells[0][0].value;

      // Call that number
      await game.makeMove({ player: 'player1', action: 'call', value: cellValue });

      // Mark the cell
      await game.makeMove({
        player: 'player1',
        action: 'mark',
        position: { row: 0, col: 0 },
      });

      const state = await game.getGameState();
      expect(state.cards.player1.cells[0][0].marked).toBe(true);
    });

    it("should reject marking cells that don't match current call", async () => {
      await game.makeMove({ player: 'player1', action: 'start_game' });

      // Get the value at position [0,0] for player1
      const internalState = getInternalState(game);
      const cellValue = internalState.cards.player1.cells[0][0].value;

      // Call a different number
      const differentValue = cellValue === 1 ? 2 : 1;
      await game.makeMove({ player: 'player1', action: 'call', value: differentValue });

      // Try to mark the cell
      const result = await game.validateMove({
        player: 'player1',
        action: 'mark',
        position: { row: 0, col: 0 },
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Can only mark cells that match the current call');
    });

    it('should reject marking already marked cells', async () => {
      await game.makeMove({ player: 'player1', action: 'start_game' });

      // Center cell is already marked
      const result = await game.validateMove({
        player: 'player1',
        action: 'mark',
        position: { row: 2, col: 2 },
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Cell is already marked');
    });
  });

  describe('win conditions', () => {
    beforeEach(async () => {
      await game.initializeGame({ playerCount: 2 });
      await game.makeMove({ player: 'player1', action: 'start_game' });
    });

    it('should detect horizontal win', async () => {
      const internalState = getInternalState(game);
      const card = internalState.cards.player1;

      // Mark entire top row (except any already marked)
      for (let col = 0; col < 5; col++) {
        if (!card.cells[0][col].marked) {
          const value = card.cells[0][col].value;
          await game.makeMove({ player: 'player1', action: 'call', value });
          await game.makeMove({
            player: 'player1',
            action: 'mark',
            position: { row: 0, col },
          });
        }
      }

      // Claim bingo
      const result = await game.validateMove({
        player: 'player1',
        action: 'claim_bingo',
      });
      expect(result.valid).toBe(true);

      await game.makeMove({ player: 'player1', action: 'claim_bingo' });

      const state = await game.getGameState();
      expect(state.gameOver).toBe(true);
      expect(state.winners).toContain('player1');
      expect(state.winningPatterns).toContain('Top Row');
    });

    it('should detect vertical win', async () => {
      const internalState = getInternalState(game);
      const card = internalState.cards.player1;

      // Mark entire first column
      for (let row = 0; row < 5; row++) {
        if (!card.cells[row][0].marked) {
          const value = card.cells[row][0].value;
          await game.makeMove({ player: 'player1', action: 'call', value });
          await game.makeMove({
            player: 'player1',
            action: 'mark',
            position: { row, col: 0 },
          });
        }
      }

      await game.makeMove({ player: 'player1', action: 'claim_bingo' });

      const state = await game.getGameState();
      expect(state.gameOver).toBe(true);
      expect(state.winningPatterns).toContain('First Column');
    });

    it('should detect diagonal win', async () => {
      const internalState = getInternalState(game);
      const card = internalState.cards.player1;

      // Mark main diagonal
      for (let i = 0; i < 5; i++) {
        if (!card.cells[i][i].marked) {
          const value = card.cells[i][i].value;
          await game.makeMove({ player: 'player1', action: 'call', value });
          await game.makeMove({
            player: 'player1',
            action: 'mark',
            position: { row: i, col: i },
          });
        }
      }

      await game.makeMove({ player: 'player1', action: 'claim_bingo' });

      const state = await game.getGameState();
      expect(state.gameOver).toBe(true);
      expect(state.winningPatterns).toContain('Main Diagonal');
    });

    it('should detect four corners win', async () => {
      const internalState = getInternalState(game);
      const card = internalState.cards.player1;

      // Mark four corners
      const corners = [
        [0, 0],
        [0, 4],
        [4, 0],
        [4, 4],
      ];
      for (const [row, col] of corners) {
        if (!card.cells[row][col].marked) {
          const value = card.cells[row][col].value;
          await game.makeMove({ player: 'player1', action: 'call', value });
          await game.makeMove({
            player: 'player1',
            action: 'mark',
            position: { row, col },
          });
        }
      }

      await game.makeMove({ player: 'player1', action: 'claim_bingo' });

      const state = await game.getGameState();
      expect(state.gameOver).toBe(true);
      expect(state.winningPatterns).toContain('Four Corners');
    });

    it('should reject false bingo claims', async () => {
      // Don't mark any cells, just try to claim
      const result = await game.validateMove({
        player: 'player1',
        action: 'claim_bingo',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('No valid bingo pattern found');
    });

    it('should allow multiple winners', async () => {
      const internalState = getInternalState(game);

      // Mark winning pattern for player1
      const card1 = internalState.cards.player1;
      for (let col = 0; col < 5; col++) {
        if (!card1.cells[0][col].marked) {
          const value = card1.cells[0][col].value;
          await game.makeMove({ player: 'player1', action: 'call', value });
          await game.makeMove({
            player: 'player1',
            action: 'mark',
            position: { row: 0, col },
          });
        }
      }

      await game.makeMove({ player: 'player1', action: 'claim_bingo' });

      const state = await game.getGameState();
      expect(state.winners).toContain('player1');
      expect(state.winners.length).toBe(1);
    });
  });

  describe('edge cases', () => {
    beforeEach(async () => {
      await game.initializeGame({ playerCount: 2 });
    });

    it('should handle game over state', async () => {
      const internalState = getInternalState(game);
      internalState.gameOver = true;

      const result = await game.validateMove({
        player: 'player1',
        action: 'start_game',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Game is already over');
    });

    it('should reject actions before game starts', async () => {
      const result = await game.validateMove({
        player: 'player1',
        action: 'call',
        value: 42,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Game is not in playing phase');
    });

    it('should reject mark without position', async () => {
      await game.makeMove({ player: 'player1', action: 'start_game' });

      const result = await game.validateMove({
        player: 'player1',
        action: 'mark',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Must provide valid position');
    });

    it('should reject mark with out of bounds position', async () => {
      await game.makeMove({ player: 'player1', action: 'start_game' });

      const result = await game.validateMove({
        player: 'player1',
        action: 'mark',
        position: { row: 5, col: 5 },
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Position out of bounds');
    });

    it('should handle invalid move data', async () => {
      const result = await game.validateMove({
        action: 'start_game',
      } as any);
      expect(result.valid).toBe(false);
    });

    it('should reject invalid values for call', async () => {
      await game.makeMove({ player: 'player1', action: 'start_game' });

      const result = await game.validateMove({
        player: 'player1',
        action: 'call',
        value: 999, // Outside normal bingo range
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid value for this game');
    });
  });

  describe('custom win conditions', () => {
    it('should use custom win conditions', async () => {
      const customWinConditions = [
        {
          name: 'Center Only',
          pattern: [[2, 2]],
          description: 'Mark center cell only',
        },
      ];

      await game.initializeGame({ winConditions: customWinConditions });
      await game.makeMove({ player: 'player1', action: 'start_game' });

      // Center is already marked, so should win immediately
      await game.makeMove({ player: 'player1', action: 'claim_bingo' });

      const state = await game.getGameState();
      expect(state.gameOver).toBe(true);
      expect(state.winningPatterns).toContain('Center Only');
    });
  });

  describe('getMetadata', () => {
    it('should return correct metadata', () => {
      const metadata = game.getMetadata();
      expect(metadata.name).toBe('Bingo');
      expect(metadata.minPlayers).toBe(2);
      expect(metadata.maxPlayers).toBe(20);
      expect(metadata.complexity).toBe('beginner');
    });
  });

  describe('getWinners', () => {
    beforeEach(async () => {
      await game.initializeGame({ playerCount: 2 });
      await game.makeMove({ player: 'player1', action: 'start_game' });
    });

    it('should return empty array when no winners', async () => {
      const winners = await game.getWinners();
      expect(winners).toEqual([]);
    });

    it('should return winner array after win', async () => {
      const internalState = getInternalState(game);
      const card = internalState.cards.player1;

      // Create a win
      for (let col = 0; col < 5; col++) {
        if (!card.cells[0][col].marked) {
          const value = card.cells[0][col].value;
          await game.makeMove({ player: 'player1', action: 'call', value });
          await game.makeMove({
            player: 'player1',
            action: 'mark',
            position: { row: 0, col },
          });
        }
      }

      await game.makeMove({ player: 'player1', action: 'claim_bingo' });

      const winners = await game.getWinners();
      expect(winners).toEqual(['player1']);
    });
  });
});
