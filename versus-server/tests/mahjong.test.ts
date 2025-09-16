import { MahjongGame } from '../src/games/mahjong.js';

// Helper function to access internal state
function getInternalState(game: any): any {
  return game.currentState;
}

describe('MahjongGame', () => {
  let game: MahjongGame;

  beforeEach(() => {
    game = new MahjongGame('test-game-id');
  });

  describe('initializeGame', () => {
    it('should initialize game with default 4 players', async () => {
      const state = await game.initializeGame();
      expect(state.playerOrder).toEqual(['player1', 'player2', 'player3', 'player4']);
      expect(state.currentPlayer).toBe('player1');
      expect(state.dealer).toBe('player1');
      expect(state.gameOver).toBe(false);
      expect(state.winner).toBeNull();
      expect(state.gamePhase).toBe('playing');
      expect(state.roundNumber).toBe(1);
    });

    it('should initialize game with custom player count', async () => {
      const state = await game.initializeGame({ playerCount: 2 });
      expect(state.playerOrder).toEqual(['player1', 'player2']);
    });

    it('should deal 13 tiles to each player', async () => {
      await game.initializeGame({ playerCount: 4 });
      const internalState = getInternalState(game);

      // Non-dealer players should have 13 tiles
      expect(internalState.hands.player2.length).toBe(13);
      expect(internalState.hands.player3.length).toBe(13);
      expect(internalState.hands.player4.length).toBe(13);
    });

    it('should give dealer 14 tiles', async () => {
      await game.initializeGame({ playerCount: 4 });
      const internalState = getInternalState(game);

      // Dealer should have 14 tiles
      expect(internalState.hands.player1.length).toBe(14);
    });

    it('should create correct number of tiles', async () => {
      await game.initializeGame({ playerCount: 4 });
      const internalState = getInternalState(game);

      // Total tiles = wall + all player hands
      const totalTiles =
        internalState.wall.length +
        Object.values(internalState.hands).reduce((sum: number, hand: any) => sum + hand.length, 0);

      // Standard Mahjong has 144 tiles (136 in simplified version)
      expect(totalTiles).toBe(136); // 4 of each: 9 bamboo + 9 character + 9 dot + 7 honors = 34 * 4
    });

    it('should initialize empty melds', async () => {
      const state = await game.initializeGame({ playerCount: 4 });
      const internalState = getInternalState(game);

      for (const playerId of state.playerOrder) {
        expect(internalState.melds[playerId]).toEqual([]);
      }
    });
  });

  describe('validateMove', () => {
    beforeEach(async () => {
      await game.initializeGame({ playerCount: 4 });
    });

    it('should validate draw action', async () => {
      const internalState = getInternalState(game);
      // Dealer needs to discard first
      const dealerTile = internalState.hands.player1[0];

      await game.makeMove({
        player: 'player1',
        action: 'discard',
        tile: dealerTile,
      });

      // Now player2 can draw
      const result = await game.validateMove({
        player: 'player2',
        action: 'draw',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject draw when already have 14 tiles', async () => {
      // Dealer already has 14 tiles
      const result = await game.validateMove({
        player: 'player1',
        action: 'draw',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Player already has drawn tile');
    });

    it('should reject draw when not player turn', async () => {
      const result = await game.validateMove({
        player: 'player2',
        action: 'draw',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("It's player1's turn");
    });

    it('should validate discard action', async () => {
      const internalState = getInternalState(game);
      const tile = internalState.hands.player1[0];

      const result = await game.validateMove({
        player: 'player1',
        action: 'discard',
        tile: tile,
      });
      expect(result.valid).toBe(true);
    });

    it('should reject discard without tile', async () => {
      const result = await game.validateMove({
        player: 'player1',
        action: 'discard',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Must specify tile to discard');
    });

    it('should reject discard when need to draw first', async () => {
      const internalState = getInternalState(game);
      // Discard a tile first
      await game.makeMove({
        player: 'player1',
        action: 'discard',
        tile: internalState.hands.player1[0],
      });

      // Player2 needs to draw before discarding
      const result = await game.validateMove({
        player: 'player2',
        action: 'discard',
        tile: internalState.hands.player2[0],
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Must draw before discarding');
    });

    it("should reject discard with tile player doesn't have", async () => {
      const fakeTile = { type: 'suit', suit: 'bamboo', value: 1, id: 'fake-tile' };

      const result = await game.validateMove({
        player: 'player1',
        action: 'discard',
        tile: fakeTile,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Player does not have this tile');
    });

    it('should reject invalid action', async () => {
      const result = await game.validateMove({
        player: 'player1',
        action: 'invalid-action',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Action must be draw, discard, or declare_win');
    });

    it('should reject move without required fields', async () => {
      const result = await game.validateMove({
        player: 'player1',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Move must include player and action');
    });

    it('should reject move by invalid player', async () => {
      const result = await game.validateMove({
        player: 'invalid-player',
        action: 'draw',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid player');
    });
  });

  describe('game flow', () => {
    beforeEach(async () => {
      await game.initializeGame({ playerCount: 4 });
    });

    it('should handle draw action', async () => {
      const internalState = getInternalState(game);

      // Dealer discards first
      await game.makeMove({
        player: 'player1',
        action: 'discard',
        tile: internalState.hands.player1[0],
      });

      const wallSizeBefore = internalState.wall.length;

      // Player2 draws
      await game.makeMove({
        player: 'player2',
        action: 'draw',
      });

      expect(internalState.hands.player2.length).toBe(14);
      expect(internalState.wall.length).toBe(wallSizeBefore - 1);
      expect(internalState.lastAction?.action).toBe('draw');
    });

    it('should handle discard action', async () => {
      const internalState = getInternalState(game);
      const tile = internalState.hands.player1[0];

      await game.makeMove({
        player: 'player1',
        action: 'discard',
        tile: tile,
      });

      expect(internalState.hands.player1.length).toBe(13);
      expect(internalState.discardPile.length).toBe(1);
      expect(internalState.discardPile[0].id).toBe(tile.id);
      expect(internalState.lastDiscard?.id).toBe(tile.id);
      expect(internalState.currentPlayer).toBe('player2');
    });

    it('should rotate players correctly', async () => {
      const internalState = getInternalState(game);

      // Player1 discards
      await game.makeMove({
        player: 'player1',
        action: 'discard',
        tile: internalState.hands.player1[0],
      });
      expect(internalState.currentPlayer).toBe('player2');

      // Player2 draw and discard
      await game.makeMove({ player: 'player2', action: 'draw' });
      await game.makeMove({
        player: 'player2',
        action: 'discard',
        tile: internalState.hands.player2[0],
      });
      expect(internalState.currentPlayer).toBe('player3');

      // Player3 draw and discard
      await game.makeMove({ player: 'player3', action: 'draw' });
      await game.makeMove({
        player: 'player3',
        action: 'discard',
        tile: internalState.hands.player3[0],
      });
      expect(internalState.currentPlayer).toBe('player4');

      // Player4 draw and discard
      await game.makeMove({ player: 'player4', action: 'draw' });
      await game.makeMove({
        player: 'player4',
        action: 'discard',
        tile: internalState.hands.player4[0],
      });
      expect(internalState.currentPlayer).toBe('player1');
    });

    it('should track last action details', async () => {
      const internalState = getInternalState(game);
      const tile = internalState.hands.player1[0];

      await game.makeMove({
        player: 'player1',
        action: 'discard',
        tile: tile,
      });

      expect(internalState.lastAction?.action).toBe('discard');
      expect(internalState.lastAction?.player).toBe('player1');
      expect(internalState.lastAction?.tile?.id).toBe(tile.id);
      expect(internalState.lastAction?.details).toContain('discarded');
    });
  });

  describe('win conditions', () => {
    beforeEach(async () => {
      await game.initializeGame({ playerCount: 4 });
    });

    it('should detect valid winning hand', async () => {
      const internalState = getInternalState(game);

      // Create a winning hand: 4 triplets + 1 pair
      const winningHand = [
        // Triplet 1
        { type: 'suit', suit: 'bamboo', value: 1, id: 'b1-1' },
        { type: 'suit', suit: 'bamboo', value: 1, id: 'b1-2' },
        { type: 'suit', suit: 'bamboo', value: 1, id: 'b1-3' },
        // Triplet 2
        { type: 'suit', suit: 'bamboo', value: 2, id: 'b2-1' },
        { type: 'suit', suit: 'bamboo', value: 2, id: 'b2-2' },
        { type: 'suit', suit: 'bamboo', value: 2, id: 'b2-3' },
        // Triplet 3
        { type: 'suit', suit: 'character', value: 3, id: 'c3-1' },
        { type: 'suit', suit: 'character', value: 3, id: 'c3-2' },
        { type: 'suit', suit: 'character', value: 3, id: 'c3-3' },
        // Triplet 4
        { type: 'suit', suit: 'dot', value: 4, id: 'd4-1' },
        { type: 'suit', suit: 'dot', value: 4, id: 'd4-2' },
        { type: 'suit', suit: 'dot', value: 4, id: 'd4-3' },
        // Pair
        { type: 'honor', honor: 'red', id: 'red-1' },
        { type: 'honor', honor: 'red', id: 'red-2' },
      ];

      internalState.hands.player1 = winningHand;

      const result = await game.validateMove({
        player: 'player1',
        action: 'declare_win',
      });
      expect(result.valid).toBe(true);

      await game.makeMove({
        player: 'player1',
        action: 'declare_win',
      });

      const state = await game.getGameState();
      expect(state.gameOver).toBe(true);
      expect(state.winner).toBe('player1');
      expect(state.gamePhase).toBe('finished');
    });

    it('should reject invalid winning declaration', async () => {
      // Player1 has default hand which is not winning
      const result = await game.validateMove({
        player: 'player1',
        action: 'declare_win',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Player does not have a winning hand');
    });

    it('should handle wall running out', async () => {
      const internalState = getInternalState(game);

      // Dealer needs to discard first since they have 14 tiles
      await game.makeMove({
        player: 'player1',
        action: 'discard',
        tile: internalState.hands.player1[0],
      });

      // Empty the wall
      internalState.wall = [];

      // Now player2 tries to draw
      const result = await game.validateMove({
        player: 'player2',
        action: 'draw',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('No tiles left in wall');
    });
  });

  describe('tile management', () => {
    beforeEach(async () => {
      await game.initializeGame({ playerCount: 4 });
    });

    it('should create correct suit tiles', async () => {
      const internalState = getInternalState(game);

      // Count suit tiles
      const allTiles = [...internalState.wall, ...Object.values(internalState.hands).flat()];

      const suitTiles = allTiles.filter(tile => tile.type === 'suit');
      expect(suitTiles.length).toBe(108); // 3 suits * 9 values * 4 copies

      // Check each suit has correct distribution
      const bambooTiles = suitTiles.filter(tile => tile.suit === 'bamboo');
      const characterTiles = suitTiles.filter(tile => tile.suit === 'character');
      const dotTiles = suitTiles.filter(tile => tile.suit === 'dot');

      expect(bambooTiles.length).toBe(36);
      expect(characterTiles.length).toBe(36);
      expect(dotTiles.length).toBe(36);
    });

    it('should create correct honor tiles', async () => {
      const internalState = getInternalState(game);

      // Count honor tiles
      const allTiles = [...internalState.wall, ...Object.values(internalState.hands).flat()];

      const honorTiles = allTiles.filter(tile => tile.type === 'honor');
      expect(honorTiles.length).toBe(28); // 7 honors * 4 copies

      // Check each honor type
      const honors = ['east', 'south', 'west', 'north', 'red', 'green', 'white'];
      for (const honor of honors) {
        const honorCount = honorTiles.filter(tile => tile.honor === honor).length;
        expect(honorCount).toBe(4);
      }
    });

    it('should have unique tile IDs', async () => {
      const internalState = getInternalState(game);

      const allTiles = [...internalState.wall, ...Object.values(internalState.hands).flat()];

      const tileIds = allTiles.map(tile => tile.id);
      const uniqueIds = new Set(tileIds);

      expect(uniqueIds.size).toBe(tileIds.length);
    });
  });

  describe('edge cases', () => {
    beforeEach(async () => {
      await game.initializeGame({ playerCount: 4 });
    });

    it('should handle game over state', async () => {
      const internalState = getInternalState(game);
      internalState.gameOver = true;
      internalState.winner = 'player1';

      const result = await game.validateMove({
        player: 'player1',
        action: 'draw',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Game is already over');
    });

    it('should handle invalid move data', async () => {
      const result = await game.validateMove({
        action: 'draw',
      } as any);
      expect(result.valid).toBe(false);
    });

    it('should clamp player count', async () => {
      const state1 = await game.initializeGame({ playerCount: 10 });
      expect(state1.playerOrder.length).toBe(4);

      const game2 = new MahjongGame('test-2');
      const state2 = await game2.initializeGame({ playerCount: 1 });
      expect(state2.playerOrder.length).toBe(2);
    });
  });

  describe('getMetadata', () => {
    it('should return correct metadata', () => {
      const metadata = game.getMetadata();
      expect(metadata.name).toBe('Mahjong');
      expect(metadata.minPlayers).toBe(2);
      expect(metadata.maxPlayers).toBe(4);
      expect(metadata.complexity).toBe('advanced');
    });
  });

  describe('getGameState', () => {
    beforeEach(async () => {
      await game.initializeGame({ playerCount: 4 });
    });

    it('should return sanitized game state', async () => {
      const state = await game.getGameState();

      expect(state.gameId).toBe('test-game-id');
      expect(state.gameType).toBe('mahjong');
      expect(state.currentPlayer).toBe('player1');
      expect(state.wallSize).toBeDefined();
      expect(state.discardPile).toBeDefined();

      // Check hands are provided with tile counts
      for (const playerId of state.playerOrder) {
        expect(state.hands[playerId]).toBeDefined();
        expect(state.hands[playerId].tileCount).toBeDefined();
      }
    });

    it('should expose discard pile', async () => {
      const internalState = getInternalState(game);
      const tile = internalState.hands.player1[0];

      await game.makeMove({
        player: 'player1',
        action: 'discard',
        tile: tile,
      });

      const state = await game.getGameState();
      expect(state.discardPile.length).toBe(1);
      expect(state.discardPile[0].id).toBe(tile.id);
      expect(state.lastDiscard?.id).toBe(tile.id);
    });
  });
});
