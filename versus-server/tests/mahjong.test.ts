import { MahjongGame } from '../src/games/mahjong.js';

// Helper function to access internal state
function getInternalState(game: any): any {
  return game.currentState;
}

function createSuitTile(suit: string, value: number, id: string): any {
  return { type: 'suit', suit, value, id };
}

function createHonorTile(honor: string, id: string): any {
  return { type: 'honor', honor, id };
}

function createNonWinningHand(prefix: string, count: number = 13): any[] {
  return [
    createSuitTile('bamboo', 1, prefix + '-b1'),
    createSuitTile('bamboo', 3, prefix + '-b3'),
    createSuitTile('bamboo', 5, prefix + '-b5'),
    createSuitTile('character', 1, prefix + '-c1'),
    createSuitTile('character', 3, prefix + '-c3'),
    createSuitTile('character', 5, prefix + '-c5'),
    createSuitTile('dot', 1, prefix + '-d1'),
    createSuitTile('dot', 3, prefix + '-d3'),
    createSuitTile('dot', 5, prefix + '-d5'),
    createHonorTile('east', prefix + '-east'),
    createHonorTile('south', prefix + '-south'),
    createHonorTile('west', prefix + '-west'),
    createHonorTile('green', prefix + '-green'),
    createHonorTile('white', prefix + '-white'),
  ].slice(0, count);
}

async function passAllClaims(game: MahjongGame): Promise<void> {
  while (getInternalState(game).claimWindow) {
    const currentPlayer = getInternalState(game).currentPlayer;
    await game.makeMove({ player: currentPlayer, action: 'pass_claim' });
  }
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

      // This engine uses the common 136-tile set without flower or season tiles
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
      await passAllClaims(game);

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
      expect(result.error).toBe(
        'Action must be draw, discard, declare_win, claim_pon, claim_chi, claim_kan, declare_kan, or pass_claim'
      );
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
      await passAllClaims(game);

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
      expect(internalState.currentPlayer).toBeTruthy();
    });

    it('should rotate players correctly', async () => {
      const internalState = getInternalState(game);

      // Player1 discards
      await game.makeMove({
        player: 'player1',
        action: 'discard',
        tile: internalState.hands.player1[0],
      });
      await passAllClaims(game);
      expect(internalState.currentPlayer).toBe('player2');

      // Player2 draw and discard
      await game.makeMove({ player: 'player2', action: 'draw' });
      await game.makeMove({
        player: 'player2',
        action: 'discard',
        tile: internalState.hands.player2[0],
      });
      await passAllClaims(game);
      expect(internalState.currentPlayer).toBe('player3');

      // Player3 draw and discard
      await game.makeMove({ player: 'player3', action: 'draw' });
      await game.makeMove({
        player: 'player3',
        action: 'discard',
        tile: internalState.hands.player3[0],
      });
      await passAllClaims(game);
      expect(internalState.currentPlayer).toBe('player4');

      // Player4 draw and discard
      await game.makeMove({ player: 'player4', action: 'draw' });
      await game.makeMove({
        player: 'player4',
        action: 'discard',
        tile: internalState.hands.player4[0],
      });
      await passAllClaims(game);
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

  describe('discard claims', () => {
    beforeEach(async () => {
      await game.initializeGame({ playerCount: 4 });
    });

    it('should let another player claim pon before the turn advances', async () => {
      const state = getInternalState(game);
      const discardTile = createHonorTile('red', 'discard-red');

      state.hands.player1 = [
        discardTile,
        createSuitTile('bamboo', 1, 'p1-b1'),
        createSuitTile('bamboo', 2, 'p1-b2'),
        createSuitTile('bamboo', 3, 'p1-b3'),
        createSuitTile('character', 1, 'p1-c1'),
        createSuitTile('character', 2, 'p1-c2'),
        createSuitTile('character', 3, 'p1-c3'),
        createSuitTile('dot', 1, 'p1-d1'),
        createSuitTile('dot', 2, 'p1-d2'),
        createSuitTile('dot', 3, 'p1-d3'),
        createHonorTile('east', 'p1-east'),
        createHonorTile('south', 'p1-south'),
        createHonorTile('west', 'p1-west'),
        createHonorTile('north', 'p1-north'),
      ];
      state.hands.player2 = [
        createSuitTile('bamboo', 4, 'p2-b4'),
        createSuitTile('bamboo', 5, 'p2-b5'),
        createSuitTile('character', 4, 'p2-c4'),
        createSuitTile('character', 5, 'p2-c5'),
        createSuitTile('dot', 4, 'p2-d4'),
        createSuitTile('dot', 5, 'p2-d5'),
        createHonorTile('east', 'p2-east'),
        createHonorTile('south', 'p2-south'),
        createHonorTile('west', 'p2-west'),
        createHonorTile('north', 'p2-north'),
        createHonorTile('green', 'p2-green'),
        createHonorTile('white', 'p2-white'),
        createSuitTile('dot', 9, 'p2-d9'),
      ];
      state.hands.player3 = [
        createHonorTile('red', 'p3-red-1'),
        createHonorTile('red', 'p3-red-2'),
        createSuitTile('bamboo', 6, 'p3-b6'),
        createSuitTile('bamboo', 7, 'p3-b7'),
        createSuitTile('character', 6, 'p3-c6'),
        createSuitTile('character', 7, 'p3-c7'),
        createSuitTile('dot', 6, 'p3-d6'),
        createSuitTile('dot', 7, 'p3-d7'),
        createHonorTile('east', 'p3-east'),
        createHonorTile('south', 'p3-south'),
        createHonorTile('west', 'p3-west'),
        createHonorTile('north', 'p3-north'),
        createSuitTile('dot', 8, 'p3-d8'),
      ];
      state.hands.player4 = [
        createSuitTile('bamboo', 8, 'p4-b8'),
        createSuitTile('bamboo', 9, 'p4-b9'),
        createSuitTile('character', 8, 'p4-c8'),
        createSuitTile('character', 9, 'p4-c9'),
        createSuitTile('dot', 8, 'p4-d8'),
        createSuitTile('dot', 9, 'p4-d9'),
        createHonorTile('east', 'p4-east'),
        createHonorTile('south', 'p4-south'),
        createHonorTile('west', 'p4-west'),
        createHonorTile('north', 'p4-north'),
        createHonorTile('green', 'p4-green'),
        createHonorTile('white', 'p4-white'),
        createSuitTile('character', 1, 'p4-c1'),
      ];
      state.currentPlayer = 'player1';
      state.discardPile = [];
      state.lastDiscard = null;
      state.lastDiscardPlayer = null;
      state.claimWindow = null;

      await game.makeMove({ player: 'player1', action: 'discard', tile: discardTile });

      expect(state.claimWindow?.phase).toBe('pon');
      expect(state.currentPlayer).toBe('player3');

      await game.makeMove({ player: 'player3', action: 'claim_pon' });

      expect(state.melds.player3).toHaveLength(1);
      expect(state.melds.player3[0]).toHaveLength(3);
      expect(state.currentPlayer).toBe('player3');
      expect(state.lastDiscard).toBeNull();
    });

    it('should let the next player claim chi with an explicit sequence choice', async () => {
      const state = getInternalState(game);
      const discardTile = createSuitTile('bamboo', 2, 'discard-b2');
      const chiLeft = createSuitTile('bamboo', 1, 'chi-b1');
      const chiRight = createSuitTile('bamboo', 3, 'chi-b3');

      state.hands.player1 = [
        discardTile,
        createSuitTile('character', 1, 'p1-c1'),
        createSuitTile('character', 2, 'p1-c2'),
        createSuitTile('character', 3, 'p1-c3'),
        createSuitTile('dot', 1, 'p1-d1'),
        createSuitTile('dot', 2, 'p1-d2'),
        createSuitTile('dot', 3, 'p1-d3'),
        createHonorTile('east', 'p1-east'),
        createHonorTile('south', 'p1-south'),
        createHonorTile('west', 'p1-west'),
        createHonorTile('north', 'p1-north'),
        createHonorTile('green', 'p1-green'),
        createHonorTile('white', 'p1-white'),
        createSuitTile('dot', 9, 'p1-d9'),
      ];
      state.hands.player2 = [
        chiLeft,
        chiRight,
        createSuitTile('bamboo', 5, 'p2-b5'),
        createSuitTile('character', 4, 'p2-c4'),
        createSuitTile('character', 5, 'p2-c5'),
        createSuitTile('dot', 4, 'p2-d4'),
        createSuitTile('dot', 5, 'p2-d5'),
        createHonorTile('east', 'p2-east'),
        createHonorTile('south', 'p2-south'),
        createHonorTile('west', 'p2-west'),
        createHonorTile('north', 'p2-north'),
        createHonorTile('red', 'p2-red'),
        createHonorTile('green', 'p2-green'),
      ];
      state.hands.player3 = [
        createSuitTile('bamboo', 6, 'p3-b6'),
        createSuitTile('bamboo', 7, 'p3-b7'),
        createSuitTile('character', 6, 'p3-c6'),
        createSuitTile('character', 7, 'p3-c7'),
        createSuitTile('dot', 6, 'p3-d6'),
        createSuitTile('dot', 7, 'p3-d7'),
        createHonorTile('east', 'p3-east'),
        createHonorTile('south', 'p3-south'),
        createHonorTile('west', 'p3-west'),
        createHonorTile('north', 'p3-north'),
        createHonorTile('red', 'p3-red'),
        createHonorTile('green', 'p3-green'),
        createHonorTile('white', 'p3-white'),
      ];
      state.hands.player4 = [
        createSuitTile('bamboo', 8, 'p4-b8'),
        createSuitTile('bamboo', 9, 'p4-b9'),
        createSuitTile('character', 8, 'p4-c8'),
        createSuitTile('character', 9, 'p4-c9'),
        createSuitTile('dot', 8, 'p4-d8'),
        createSuitTile('dot', 9, 'p4-d9'),
        createHonorTile('east', 'p4-east'),
        createHonorTile('south', 'p4-south'),
        createHonorTile('west', 'p4-west'),
        createHonorTile('north', 'p4-north'),
        createHonorTile('red', 'p4-red'),
        createHonorTile('green', 'p4-green'),
        createHonorTile('white', 'p4-white'),
      ];
      state.currentPlayer = 'player1';
      state.discardPile = [];
      state.lastDiscard = null;
      state.lastDiscardPlayer = null;
      state.claimWindow = null;

      await game.makeMove({ player: 'player1', action: 'discard', tile: discardTile });

      expect(state.claimWindow?.phase).toBe('chi');
      expect(state.currentPlayer).toBe('player2');

      await game.makeMove({
        player: 'player2',
        action: 'claim_chi',
        tiles: [chiLeft, chiRight],
      });

      expect(state.melds.player2).toHaveLength(1);
      expect(state.melds.player2[0]).toHaveLength(3);
      expect(state.currentPlayer).toBe('player2');
      expect(state.lastDiscard).toBeNull();
    });

    it("should let a player win off another player's discard with a scored Chinese Official hand", async () => {
      const state = getInternalState(game);
      const discardTile = createHonorTile('red', 'discard-red-win');

      state.hands.player1 = [discardTile, ...createNonWinningHand('p1-win', 13)];
      state.hands.player2 = [
        createSuitTile('bamboo', 4, 'p2-b4-1'),
        createSuitTile('bamboo', 4, 'p2-b4-2'),
        createSuitTile('bamboo', 4, 'p2-b4-3'),
        createSuitTile('character', 5, 'p2-c5-1'),
        createSuitTile('character', 5, 'p2-c5-2'),
        createSuitTile('character', 5, 'p2-c5-3'),
        createSuitTile('dot', 6, 'p2-d6-1'),
        createSuitTile('dot', 6, 'p2-d6-2'),
        createSuitTile('dot', 6, 'p2-d6-3'),
        createSuitTile('character', 8, 'p2-c8-1'),
        createSuitTile('character', 8, 'p2-c8-2'),
        createHonorTile('red', 'p2-red-1'),
        createHonorTile('red', 'p2-red-2'),
      ];
      state.hands.player3 = createNonWinningHand('p3-win');
      state.hands.player4 = createNonWinningHand('p4-win');
      state.currentPlayer = 'player1';
      state.discardPile = [];
      state.lastDiscard = null;
      state.lastDiscardPlayer = null;
      state.claimWindow = null;

      await game.makeMove({ player: 'player1', action: 'discard', tile: discardTile });

      expect(state.claimWindow?.phase).toBe('ron');
      expect(state.currentPlayer).toBe('player2');

      await game.makeMove({ player: 'player2', action: 'declare_win' });

      expect(state.gameOver).toBe(true);
      expect(state.winner).toBe('player2');
      expect(state.gamePhase).toBe('finished');
      expect(state.winningResult?.method).toBe('discard');
      expect(state.winningResult?.totalFan).toBe(10);
      expect(state.winningResult?.payments.player1).toBe(18);
      expect(state.winningResult?.payments.player3).toBe(8);
      expect(state.winningResult?.payments.player4).toBe(8);
    });
  });

  describe('kan flow', () => {
    beforeEach(async () => {
      await game.initializeGame({ playerCount: 4 });
    });

    it('should allow a player to declare a concealed kan and draw a supplemental tile', async () => {
      const state = getInternalState(game);
      const kanTiles = [
        createHonorTile('red', 'p1-red-1'),
        createHonorTile('red', 'p1-red-2'),
        createHonorTile('red', 'p1-red-3'),
        createHonorTile('red', 'p1-red-4'),
      ];
      const supplementalTile = createSuitTile('dot', 9, 'supplemental-concealed');

      state.hands.player1 = [...kanTiles, ...createNonWinningHand('p1-fill', 10)];
      state.hands.player2 = createNonWinningHand('p2');
      state.hands.player3 = createNonWinningHand('p3');
      state.hands.player4 = createNonWinningHand('p4');
      state.melds = { player1: [], player2: [], player3: [], player4: [] };
      state.wall = [createSuitTile('bamboo', 9, 'wall-live-1'), supplementalTile];
      state.currentPlayer = 'player1';
      state.discardPile = [];
      state.lastDiscard = null;
      state.lastDiscardPlayer = null;
      state.claimWindow = null;
      state.supplementalDrawsUsed = 0;
      state.gameOver = false;
      state.winner = null;
      state.gamePhase = 'playing';

      const validation = await game.validateMove({
        player: 'player1',
        action: 'declare_kan',
        tile: kanTiles[0],
      });
      expect(validation.valid).toBe(true);

      await game.makeMove({
        player: 'player1',
        action: 'declare_kan',
        tile: kanTiles[0],
      });

      expect(state.melds.player1).toHaveLength(1);
      expect(state.melds.player1[0]).toHaveLength(4);
      expect(state.hands.player1.some((tile: any) => tile.id === supplementalTile.id)).toBe(true);
      expect(state.supplementalDrawsUsed).toBe(1);
      expect(state.lastAction?.action).toBe('declare_kan');

      const discardValidation = await game.validateMove({
        player: 'player1',
        action: 'discard',
        tile: state.hands.player1[0],
      });
      expect(discardValidation.valid).toBe(true);
    });

    it('should let a player claim kan from a discard and draw a supplemental tile', async () => {
      const state = getInternalState(game);
      const discardTile = createHonorTile('red', 'discard-red-kan');
      const supplementalTile = createSuitTile('dot', 8, 'supplemental-claim-kan');

      state.hands.player1 = [discardTile, ...createNonWinningHand('p1', 13)];
      state.hands.player2 = createNonWinningHand('p2');
      state.hands.player3 = [
        createHonorTile('red', 'p3-red-1'),
        createHonorTile('red', 'p3-red-2'),
        createHonorTile('red', 'p3-red-3'),
        ...createNonWinningHand('p3-fill', 10),
      ];
      state.hands.player4 = createNonWinningHand('p4');
      state.melds = { player1: [], player2: [], player3: [], player4: [] };
      state.wall = [createSuitTile('character', 9, 'wall-live-2'), supplementalTile];
      state.currentPlayer = 'player1';
      state.discardPile = [];
      state.lastDiscard = null;
      state.lastDiscardPlayer = null;
      state.claimWindow = null;
      state.supplementalDrawsUsed = 0;
      state.gameOver = false;
      state.winner = null;
      state.gamePhase = 'playing';

      await game.makeMove({ player: 'player1', action: 'discard', tile: discardTile });

      expect(state.claimWindow?.phase).toBe('pon');
      expect(state.currentPlayer).toBe('player3');

      const validation = await game.validateMove({
        player: 'player3',
        action: 'claim_kan',
      });
      expect(validation.valid).toBe(true);

      await game.makeMove({ player: 'player3', action: 'claim_kan' });

      expect(state.melds.player3).toHaveLength(1);
      expect(state.melds.player3[0]).toHaveLength(4);
      expect(state.hands.player3.some((tile: any) => tile.id === supplementalTile.id)).toBe(true);
      expect(state.currentPlayer).toBe('player3');
      expect(state.lastDiscard).toBeNull();
      expect(state.supplementalDrawsUsed).toBe(1);

      const discardValidation = await game.validateMove({
        player: 'player3',
        action: 'discard',
        tile: state.hands.player3[0],
      });
      expect(discardValidation.valid).toBe(true);
    });

    it('should allow upgrading an open pon into an added kan', async () => {
      const state = getInternalState(game);
      const addedKanTile = createHonorTile('white', 'p1-white-4');
      const supplementalTile = createSuitTile('character', 8, 'supplemental-added-kan');

      state.hands.player1 = [addedKanTile, ...createNonWinningHand('p1-added', 10)];
      state.hands.player2 = createNonWinningHand('p2');
      state.hands.player3 = createNonWinningHand('p3');
      state.hands.player4 = createNonWinningHand('p4');
      state.melds = {
        player1: [[
          createHonorTile('white', 'p1-white-1'),
          createHonorTile('white', 'p1-white-2'),
          createHonorTile('white', 'p1-white-3'),
        ]],
        player2: [],
        player3: [],
        player4: [],
      };
      state.wall = [createSuitTile('dot', 7, 'wall-live-3'), supplementalTile];
      state.currentPlayer = 'player1';
      state.discardPile = [];
      state.lastDiscard = null;
      state.lastDiscardPlayer = null;
      state.claimWindow = null;
      state.supplementalDrawsUsed = 0;
      state.gameOver = false;
      state.winner = null;
      state.gamePhase = 'playing';

      const validation = await game.validateMove({
        player: 'player1',
        action: 'declare_kan',
        tile: addedKanTile,
      });
      expect(validation.valid).toBe(true);

      await game.makeMove({
        player: 'player1',
        action: 'declare_kan',
        tile: addedKanTile,
      });

      expect(state.melds.player1).toHaveLength(1);
      expect(state.melds.player1[0]).toHaveLength(4);
      expect(state.hands.player1.some((tile: any) => tile.id === supplementalTile.id)).toBe(true);
      expect(state.supplementalDrawsUsed).toBe(1);

      const discardValidation = await game.validateMove({
        player: 'player1',
        action: 'discard',
        tile: state.hands.player1[0],
      });
      expect(discardValidation.valid).toBe(true);
    });
  });

  describe('win conditions', () => {
    beforeEach(async () => {
      await game.initializeGame({ playerCount: 4 });
    });

    it('should score a concealed all-pungs Chinese Official win', async () => {
      const internalState = getInternalState(game);

      const winningHand = [
        createSuitTile('bamboo', 1, 'b1-1'),
        createSuitTile('bamboo', 1, 'b1-2'),
        createSuitTile('bamboo', 1, 'b1-3'),
        createSuitTile('bamboo', 2, 'b2-1'),
        createSuitTile('bamboo', 2, 'b2-2'),
        createSuitTile('bamboo', 2, 'b2-3'),
        createSuitTile('character', 3, 'c3-1'),
        createSuitTile('character', 3, 'c3-2'),
        createSuitTile('character', 3, 'c3-3'),
        createHonorTile('red', 'red-1'),
        createHonorTile('red', 'red-2'),
        createHonorTile('red', 'red-3'),
        createSuitTile('dot', 8, 'd8-1'),
        createSuitTile('dot', 8, 'd8-2'),
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
      expect(state.winningResult.totalFan).toBe(13);
      expect(state.winningResult.breakdown).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'All Pungs', fan: 6 }),
          expect.objectContaining({ name: 'Dragon Pung', fan: 2 }),
          expect.objectContaining({ name: 'Fully Concealed Hand', fan: 4 }),
          expect.objectContaining({ name: 'Pung Of Terminals Or Honors', fan: 1 }),
        ])
      );
    });

    it('should score a full-flush chow hand under Chinese Official rules', async () => {
      const internalState = getInternalState(game);

      const winningHand = [
        createSuitTile('bamboo', 1, 'b1-1'),
        createSuitTile('bamboo', 2, 'b2-1'),
        createSuitTile('bamboo', 3, 'b3-1'),
        createSuitTile('bamboo', 2, 'b2-2'),
        createSuitTile('bamboo', 3, 'b3-2'),
        createSuitTile('bamboo', 4, 'b4-1'),
        createSuitTile('bamboo', 4, 'b4-2'),
        createSuitTile('bamboo', 5, 'b5-1'),
        createSuitTile('bamboo', 6, 'b6-1'),
        createSuitTile('bamboo', 7, 'b7-1'),
        createSuitTile('bamboo', 8, 'b8-1'),
        createSuitTile('bamboo', 9, 'b9-1'),
        createSuitTile('bamboo', 5, 'b5-2'),
        createSuitTile('bamboo', 5, 'b5-3'),
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
      expect(state.winningResult.totalFan).toBe(30);
      expect(state.winningResult.breakdown).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Full Flush', fan: 24 }),
          expect.objectContaining({ name: 'All Chows', fan: 2 }),
          expect.objectContaining({ name: 'Fully Concealed Hand', fan: 4 }),
        ])
      );
    });

    it('should detect a seven-pairs winning hand', async () => {
      const internalState = getInternalState(game);

      const winningHand = [
        createSuitTile('bamboo', 1, 'b1-1'),
        createSuitTile('bamboo', 1, 'b1-2'),
        createSuitTile('bamboo', 3, 'b3-1'),
        createSuitTile('bamboo', 3, 'b3-2'),
        createSuitTile('character', 5, 'c5-1'),
        createSuitTile('character', 5, 'c5-2'),
        createSuitTile('character', 7, 'c7-1'),
        createSuitTile('character', 7, 'c7-2'),
        createSuitTile('dot', 2, 'd2-1'),
        createSuitTile('dot', 2, 'd2-2'),
        createHonorTile('east', 'east-1'),
        createHonorTile('east', 'east-2'),
        createHonorTile('white', 'white-1'),
        createHonorTile('white', 'white-2'),
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
      expect(state.winningResult.totalFan).toBe(25);
      expect(state.winningResult.breakdown).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Seven Pairs', fan: 24 }),
          expect.objectContaining({ name: 'Self Drawn', fan: 1 }),
        ])
      );
    });

    it('should reject a structurally complete hand that does not meet the 8-fan minimum', async () => {
      const internalState = getInternalState(game);

      internalState.hands.player1 = [
        createSuitTile('bamboo', 1, 'low-b1'),
        createSuitTile('bamboo', 2, 'low-b2'),
        createSuitTile('bamboo', 3, 'low-b3'),
        createSuitTile('character', 2, 'low-c2'),
        createSuitTile('character', 3, 'low-c3'),
        createSuitTile('character', 4, 'low-c4'),
        createSuitTile('dot', 4, 'low-d4'),
        createSuitTile('dot', 5, 'low-d5'),
        createSuitTile('dot', 6, 'low-d6'),
        createSuitTile('dot', 7, 'low-d7'),
        createSuitTile('dot', 8, 'low-d8'),
        createSuitTile('dot', 9, 'low-d9'),
        createSuitTile('bamboo', 5, 'low-b5-1'),
        createSuitTile('bamboo', 5, 'low-b5-2'),
      ];

      const result = await game.validateMove({
        player: 'player1',
        action: 'declare_win',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Chinese Official winning hand worth at least 8 fan');
    });

    it('should end the round in a draw when only dead wall tiles remain after a discard', async () => {
      const internalState = getInternalState(game);
      const discardTile = createHonorTile('red', 'draw-red');

      internalState.hands.player1 = [discardTile, ...createNonWinningHand('draw-p1', 13)];
      internalState.hands.player2 = createNonWinningHand('draw-p2');
      internalState.hands.player3 = createNonWinningHand('draw-p3');
      internalState.hands.player4 = createNonWinningHand('draw-p4');
      internalState.melds = { player1: [], player2: [], player3: [], player4: [] };
      internalState.wall = Array.from({ length: 14 }, (_, index) =>
        createSuitTile('bamboo', (index % 9) + 1, 'dead-wall-' + index)
      );
      internalState.currentPlayer = 'player1';
      internalState.discardPile = [];
      internalState.lastDiscard = null;
      internalState.lastDiscardPlayer = null;
      internalState.claimWindow = null;
      internalState.supplementalDrawsUsed = 0;
      internalState.gameOver = false;
      internalState.winner = null;
      internalState.gamePhase = 'playing';

      await game.makeMove({
        player: 'player1',
        action: 'discard',
        tile: discardTile,
      });

      expect(internalState.gameOver).toBe(true);
      expect(internalState.winner).toBeNull();
      expect(internalState.gamePhase).toBe('finished');
      expect(internalState.lastAction?.action).toBe('draw_game');
    });
  });

  describe('session progression', () => {
    beforeEach(async () => {
      await game.initializeGame({ playerCount: 4 });
    });

    it('should accumulate session scores from a winning hand', async () => {
      const state = getInternalState(game);
      const discardTile = createHonorTile('red', 'session-red-win');

      state.hands.player1 = [discardTile, ...createNonWinningHand('session-p1', 13)];
      state.hands.player2 = [
        createSuitTile('bamboo', 4, 'session-b4-1'),
        createSuitTile('bamboo', 4, 'session-b4-2'),
        createSuitTile('bamboo', 4, 'session-b4-3'),
        createSuitTile('character', 5, 'session-c5-1'),
        createSuitTile('character', 5, 'session-c5-2'),
        createSuitTile('character', 5, 'session-c5-3'),
        createSuitTile('dot', 6, 'session-d6-1'),
        createSuitTile('dot', 6, 'session-d6-2'),
        createSuitTile('dot', 6, 'session-d6-3'),
        createSuitTile('character', 8, 'session-c8-1'),
        createSuitTile('character', 8, 'session-c8-2'),
        createHonorTile('red', 'session-red-1'),
        createHonorTile('red', 'session-red-2'),
      ];
      state.hands.player3 = createNonWinningHand('session-p3');
      state.hands.player4 = createNonWinningHand('session-p4');
      state.currentPlayer = 'player1';
      state.discardPile = [];
      state.lastDiscard = null;
      state.lastDiscardPlayer = null;
      state.claimWindow = null;

      await game.makeMove({ player: 'player1', action: 'discard', tile: discardTile });
      await game.makeMove({ player: 'player2', action: 'declare_win' });

      expect(state.sessionScores.player2).toBe(34);
      expect(state.sessionScores.player1).toBe(-18);
      expect(state.sessionScores.player3).toBe(-8);
      expect(state.sessionScores.player4).toBe(-8);
    });

    it('should rotate dealer and seat winds when starting the next hand', async () => {
      const state = getInternalState(game);
      const discardTile = createHonorTile('red', 'next-hand-red');

      state.hands.player1 = [discardTile, ...createNonWinningHand('next-p1', 13)];
      state.hands.player2 = [
        createSuitTile('bamboo', 4, 'next-b4-1'),
        createSuitTile('bamboo', 4, 'next-b4-2'),
        createSuitTile('bamboo', 4, 'next-b4-3'),
        createSuitTile('character', 5, 'next-c5-1'),
        createSuitTile('character', 5, 'next-c5-2'),
        createSuitTile('character', 5, 'next-c5-3'),
        createSuitTile('dot', 6, 'next-d6-1'),
        createSuitTile('dot', 6, 'next-d6-2'),
        createSuitTile('dot', 6, 'next-d6-3'),
        createSuitTile('character', 8, 'next-c8-1'),
        createSuitTile('character', 8, 'next-c8-2'),
        createHonorTile('red', 'next-red-1'),
        createHonorTile('red', 'next-red-2'),
      ];
      state.hands.player3 = createNonWinningHand('next-p3');
      state.hands.player4 = createNonWinningHand('next-p4');
      state.currentPlayer = 'player1';
      state.discardPile = [];
      state.lastDiscard = null;
      state.lastDiscardPlayer = null;
      state.claimWindow = null;

      await game.makeMove({ player: 'player1', action: 'discard', tile: discardTile });
      await game.makeMove({ player: 'player2', action: 'declare_win' });

      const nextState = await game.startNextHand();

      expect(nextState.roundNumber).toBe(2);
      expect(nextState.dealer).toBe('player2');
      expect(nextState.currentPlayer).toBe('player2');
      expect(nextState.prevalentWind).toBe('east');
      expect(nextState.seatWinds.player2).toBe('east');
      expect(nextState.seatWinds.player3).toBe('south');
      expect(nextState.seatWinds.player4).toBe('west');
      expect(nextState.seatWinds.player1).toBe('north');
      expect(nextState.sessionScores.player2).toBe(34);
      expect(nextState.hands.player2.tileCount).toBe(14);
      expect(nextState.hands.player1.tileCount).toBe(13);
      expect(nextState.gameOver).toBe(false);
      expect(nextState.gamePhase).toBe('playing');
    });
  });

  describe('official endgame bonuses', () => {
    beforeEach(async () => {
      await game.initializeGame({ playerCount: 4 });
    });

    it('should end in a draw instead of allowing chi after the last live-wall discard', async () => {
      const state = getInternalState(game);
      const discardTile = createSuitTile('bamboo', 5, 'last-tile-discard');
      const liveWallTile = createHonorTile('white', 'last-live-wall-tile');

      state.hands.player1 = [discardTile, ...createNonWinningHand('last-p1', 12)];
      state.hands.player2 = [
        createSuitTile('bamboo', 4, 'last-p2-b4'),
        createSuitTile('bamboo', 6, 'last-p2-b6'),
        ...createNonWinningHand('last-p2', 11),
      ];
      state.hands.player3 = createNonWinningHand('last-p3');
      state.hands.player4 = createNonWinningHand('last-p4');
      state.wall = [
        liveWallTile,
        ...Array.from({ length: 14 }, (_, index) =>
          createSuitTile('character', (index % 9) + 1, 'last-dead-' + index)
        ),
      ];
      state.currentPlayer = 'player1';
      state.discardPile = [];
      state.lastDiscard = null;
      state.lastDiscardPlayer = null;
      state.claimWindow = null;
      state.lastTilePointReached = false;
      state.lastDrawSource = null;
      state.supplementalDrawsUsed = 0;
      state.gameOver = false;
      state.winner = null;
      state.gamePhase = 'playing';

      await game.makeMove({ player: 'player1', action: 'draw' });
      expect(state.lastTilePointReached).toBe(true);

      await game.makeMove({ player: 'player1', action: 'discard', tile: discardTile });

      expect(state.claimWindow).toBeNull();
      expect(state.gameOver).toBe(true);
      expect(state.winner).toBeNull();
      expect(state.lastAction?.action).toBe('draw_game');
    });

    it('should score Last Tile Draw without adding Self Drawn', async () => {
      const state = getInternalState(game);

      state.hands.player1 = [
        createSuitTile('bamboo', 1, 'ltd-b1-1'),
        createSuitTile('bamboo', 1, 'ltd-b1-2'),
        createSuitTile('bamboo', 3, 'ltd-b3-1'),
        createSuitTile('bamboo', 3, 'ltd-b3-2'),
        createSuitTile('character', 5, 'ltd-c5-1'),
        createSuitTile('character', 5, 'ltd-c5-2'),
        createSuitTile('character', 7, 'ltd-c7-1'),
        createSuitTile('character', 7, 'ltd-c7-2'),
        createSuitTile('dot', 2, 'ltd-d2-1'),
        createSuitTile('dot', 2, 'ltd-d2-2'),
        createHonorTile('east', 'ltd-east-1'),
        createHonorTile('east', 'ltd-east-2'),
        createHonorTile('white', 'ltd-white-1'),
      ];
      state.hands.player2 = createNonWinningHand('ltd-p2');
      state.hands.player3 = createNonWinningHand('ltd-p3');
      state.hands.player4 = createNonWinningHand('ltd-p4');
      state.wall = [
        createHonorTile('white', 'ltd-white-2'),
        ...Array.from({ length: 14 }, (_, index) =>
          createSuitTile('dot', (index % 9) + 1, 'ltd-dead-' + index)
        ),
      ];
      state.currentPlayer = 'player1';
      state.discardPile = [];
      state.lastDiscard = null;
      state.lastDiscardPlayer = null;
      state.claimWindow = null;
      state.lastTilePointReached = false;
      state.lastDrawSource = null;
      state.supplementalDrawsUsed = 0;
      state.gameOver = false;
      state.winner = null;
      state.gamePhase = 'playing';

      await game.makeMove({ player: 'player1', action: 'draw' });
      await game.makeMove({ player: 'player1', action: 'declare_win' });

      expect(state.winningResult?.breakdown).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Seven Pairs', fan: 24 }),
          expect.objectContaining({ name: 'Last Tile Draw', fan: 8 }),
        ])
      );
      expect(state.winningResult?.breakdown.map((item: any) => item.name)).not.toContain('Self Drawn');
    });

    it('should score Out With Replacement Tile without adding Self Drawn', async () => {
      const state = getInternalState(game);
      const kanTile = createHonorTile('red', 'owrt-red-1');

      state.hands.player1 = [
        kanTile,
        createHonorTile('red', 'owrt-red-2'),
        createHonorTile('red', 'owrt-red-3'),
        createHonorTile('red', 'owrt-red-4'),
        createSuitTile('bamboo', 4, 'owrt-b4-1'),
        createSuitTile('bamboo', 4, 'owrt-b4-2'),
        createSuitTile('bamboo', 4, 'owrt-b4-3'),
        createSuitTile('character', 5, 'owrt-c5-1'),
        createSuitTile('character', 5, 'owrt-c5-2'),
        createSuitTile('character', 5, 'owrt-c5-3'),
        createSuitTile('character', 8, 'owrt-c8-1'),
        createSuitTile('character', 8, 'owrt-c8-2'),
        createSuitTile('dot', 6, 'owrt-d6-1'),
        createSuitTile('dot', 6, 'owrt-d6-2'),
      ];
      state.hands.player2 = createNonWinningHand('owrt-p2');
      state.hands.player3 = createNonWinningHand('owrt-p3');
      state.hands.player4 = createNonWinningHand('owrt-p4');
      state.melds = { player1: [], player2: [], player3: [], player4: [] };
      state.wall = [
        ...Array.from({ length: 14 }, (_, index) =>
          createSuitTile('bamboo', (index % 9) + 1, 'owrt-fill-' + index)
        ),
        createSuitTile('dot', 6, 'owrt-d6-3'),
      ];
      state.currentPlayer = 'player1';
      state.discardPile = [];
      state.lastDiscard = null;
      state.lastDiscardPlayer = null;
      state.claimWindow = null;
      state.lastTilePointReached = false;
      state.lastDrawSource = null;
      state.supplementalDrawsUsed = 0;
      state.gameOver = false;
      state.winner = null;
      state.gamePhase = 'playing';

      await game.makeMove({ player: 'player1', action: 'declare_kan', tile: kanTile });
      await game.makeMove({ player: 'player1', action: 'declare_win' });

      expect(state.winningResult?.breakdown).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Out With Replacement Tile', fan: 8 }),
          expect.objectContaining({ name: 'All Pungs', fan: 6 }),
          expect.objectContaining({ name: 'Dragon Pung', fan: 2 }),
        ])
      );
      expect(state.winningResult?.breakdown.map((item: any) => item.name)).not.toContain('Self Drawn');
    });
  });

  describe('robbing the kong', () => {
    beforeEach(async () => {
      await game.initializeGame({ playerCount: 4 });
    });

    it('should let another player win by robbing an added kong', async () => {
      const state = getInternalState(game);
      const ponTiles = [
        createHonorTile('white', 'rk-pon-1'),
        createHonorTile('white', 'rk-pon-2'),
        createHonorTile('white', 'rk-pon-3'),
      ];
      const addedTile = createHonorTile('white', 'rk-added-white');

      state.hands.player1 = [addedTile, ...createNonWinningHand('rk-p1-fill', 10)];
      state.hands.player2 = [
        createSuitTile('bamboo', 1, 'rk-b1-1'),
        createSuitTile('bamboo', 1, 'rk-b1-2'),
        createSuitTile('bamboo', 3, 'rk-b3-1'),
        createSuitTile('bamboo', 3, 'rk-b3-2'),
        createSuitTile('character', 5, 'rk-c5-1'),
        createSuitTile('character', 5, 'rk-c5-2'),
        createSuitTile('character', 7, 'rk-c7-1'),
        createSuitTile('character', 7, 'rk-c7-2'),
        createSuitTile('dot', 2, 'rk-d2-1'),
        createSuitTile('dot', 2, 'rk-d2-2'),
        createHonorTile('east', 'rk-east-1'),
        createHonorTile('east', 'rk-east-2'),
        createHonorTile('white', 'rk-white-1'),
      ];
      state.hands.player3 = createNonWinningHand('rk-p3');
      state.hands.player4 = createNonWinningHand('rk-p4');
      state.melds = { player1: [ponTiles], player2: [], player3: [], player4: [] };
      state.meldStates = { player1: [], player2: [], player3: [], player4: [] };
      state.wall = [createSuitTile('dot', 9, 'rk-supplemental')];
      state.currentPlayer = 'player1';
      state.discardPile = [];
      state.lastDiscard = null;
      state.lastDiscardPlayer = null;
      state.claimWindow = null;
      state.pendingAddedKong = null;
      state.lastTilePointReached = false;
      state.lastDrawSource = null;
      state.supplementalDrawsUsed = 0;
      state.gameOver = false;
      state.winner = null;
      state.gamePhase = 'playing';

      await game.makeMove({ player: 'player1', action: 'declare_kan', tile: addedTile });

      expect(state.claimWindow?.source).toBe('rob_kong');
      expect(state.currentPlayer).toBe('player2');

      await game.makeMove({ player: 'player2', action: 'declare_win' });

      expect(state.gameOver).toBe(true);
      expect(state.winner).toBe('player2');
      expect(state.winningResult?.breakdown).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Seven Pairs', fan: 24 }),
          expect.objectContaining({ name: 'Robbing The Kong', fan: 8 }),
        ])
      );
      expect(state.melds.player1[0]).toHaveLength(3);
    });

    it('should complete the added kong if every robbing player passes', async () => {
      const state = getInternalState(game);
      const ponTiles = [
        createHonorTile('white', 'rkp-pon-1'),
        createHonorTile('white', 'rkp-pon-2'),
        createHonorTile('white', 'rkp-pon-3'),
      ];
      const addedTile = createHonorTile('white', 'rkp-added-white');
      const supplementalTile = createSuitTile('dot', 9, 'rkp-supplemental');

      state.hands.player1 = [addedTile, ...createNonWinningHand('rkp-p1-fill', 10)];
      state.hands.player2 = [
        createSuitTile('bamboo', 1, 'rkp-b1-1'),
        createSuitTile('bamboo', 1, 'rkp-b1-2'),
        createSuitTile('bamboo', 3, 'rkp-b3-1'),
        createSuitTile('bamboo', 3, 'rkp-b3-2'),
        createSuitTile('character', 5, 'rkp-c5-1'),
        createSuitTile('character', 5, 'rkp-c5-2'),
        createSuitTile('character', 7, 'rkp-c7-1'),
        createSuitTile('character', 7, 'rkp-c7-2'),
        createSuitTile('dot', 2, 'rkp-d2-1'),
        createSuitTile('dot', 2, 'rkp-d2-2'),
        createHonorTile('east', 'rkp-east-1'),
        createHonorTile('east', 'rkp-east-2'),
        createHonorTile('white', 'rkp-white-1'),
      ];
      state.hands.player3 = createNonWinningHand('rkp-p3');
      state.hands.player4 = createNonWinningHand('rkp-p4');
      state.melds = { player1: [ponTiles], player2: [], player3: [], player4: [] };
      state.meldStates = { player1: [], player2: [], player3: [], player4: [] };
      state.wall = [supplementalTile];
      state.currentPlayer = 'player1';
      state.discardPile = [];
      state.lastDiscard = null;
      state.lastDiscardPlayer = null;
      state.claimWindow = null;
      state.pendingAddedKong = null;
      state.lastTilePointReached = false;
      state.lastDrawSource = null;
      state.supplementalDrawsUsed = 0;
      state.gameOver = false;
      state.winner = null;
      state.gamePhase = 'playing';

      await game.makeMove({ player: 'player1', action: 'declare_kan', tile: addedTile });
      await game.makeMove({ player: 'player2', action: 'pass_claim' });

      expect(state.claimWindow).toBeNull();
      expect(state.pendingAddedKong).toBeNull();
      expect(state.melds.player1[0]).toHaveLength(4);
      expect(state.hands.player1.some((tile: any) => tile.id === supplementalTile.id)).toBe(true);
      expect(state.currentPlayer).toBe('player1');
      expect(state.lastAction?.action).toBe('declare_kan');
    });
  });

  describe('special closed hands', () => {
    beforeEach(async () => {
      await game.initializeGame({ playerCount: 4 });
    });

    it('should score Thirteen Orphans as an 88-fan hand', async () => {
      const state = getInternalState(game);

      state.hands.player1 = [
        createSuitTile('bamboo', 1, 'to-b1'),
        createSuitTile('bamboo', 9, 'to-b9'),
        createSuitTile('character', 1, 'to-c1'),
        createSuitTile('character', 9, 'to-c9'),
        createSuitTile('dot', 1, 'to-d1'),
        createSuitTile('dot', 9, 'to-d9'),
        createHonorTile('east', 'to-east'),
        createHonorTile('south', 'to-south'),
        createHonorTile('west', 'to-west'),
        createHonorTile('north', 'to-north'),
        createHonorTile('red', 'to-red'),
        createHonorTile('green', 'to-green'),
        createHonorTile('white', 'to-white-1'),
        createHonorTile('white', 'to-white-2'),
      ];

      await game.makeMove({ player: 'player1', action: 'declare_win' });

      expect(state.winningResult?.totalFan).toBe(92);
      expect(state.winningResult?.breakdown).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Thirteen Orphans', fan: 88 }),
          expect.objectContaining({ name: 'Fully Concealed Hand', fan: 4 }),
        ])
      );
    });

    it('should score Nine Gates as an 88-fan hand', async () => {
      const state = getInternalState(game);

      state.hands.player1 = [
        createSuitTile('bamboo', 1, 'ng-b1-1'),
        createSuitTile('bamboo', 1, 'ng-b1-2'),
        createSuitTile('bamboo', 1, 'ng-b1-3'),
        createSuitTile('bamboo', 2, 'ng-b2'),
        createSuitTile('bamboo', 3, 'ng-b3'),
        createSuitTile('bamboo', 4, 'ng-b4'),
        createSuitTile('bamboo', 5, 'ng-b5-1'),
        createSuitTile('bamboo', 5, 'ng-b5-2'),
        createSuitTile('bamboo', 6, 'ng-b6'),
        createSuitTile('bamboo', 7, 'ng-b7'),
        createSuitTile('bamboo', 8, 'ng-b8'),
        createSuitTile('bamboo', 9, 'ng-b9-1'),
        createSuitTile('bamboo', 9, 'ng-b9-2'),
        createSuitTile('bamboo', 9, 'ng-b9-3'),
      ];

      await game.makeMove({ player: 'player1', action: 'declare_win' });

      expect(state.winningResult?.totalFan).toBe(92);
      expect(state.winningResult?.breakdown).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Nine Gates', fan: 88 }),
          expect.objectContaining({ name: 'Fully Concealed Hand', fan: 4 }),
        ])
      );
    });

    it('should score Seven Shifted Pairs as an 88-fan hand', async () => {
      const state = getInternalState(game);

      state.hands.player1 = [
        createSuitTile('bamboo', 1, 'ssp-b1-1'),
        createSuitTile('bamboo', 1, 'ssp-b1-2'),
        createSuitTile('bamboo', 2, 'ssp-b2-1'),
        createSuitTile('bamboo', 2, 'ssp-b2-2'),
        createSuitTile('bamboo', 3, 'ssp-b3-1'),
        createSuitTile('bamboo', 3, 'ssp-b3-2'),
        createSuitTile('bamboo', 4, 'ssp-b4-1'),
        createSuitTile('bamboo', 4, 'ssp-b4-2'),
        createSuitTile('bamboo', 5, 'ssp-b5-1'),
        createSuitTile('bamboo', 5, 'ssp-b5-2'),
        createSuitTile('bamboo', 6, 'ssp-b6-1'),
        createSuitTile('bamboo', 6, 'ssp-b6-2'),
        createSuitTile('bamboo', 7, 'ssp-b7-1'),
        createSuitTile('bamboo', 7, 'ssp-b7-2'),
      ];

      await game.makeMove({ player: 'player1', action: 'declare_win' });

      expect(state.winningResult?.totalFan).toBe(92);
      expect(state.winningResult?.breakdown).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Seven Shifted Pairs', fan: 88 }),
          expect.objectContaining({ name: 'Fully Concealed Hand', fan: 4 }),
        ])
      );
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

      const suitTiles = allTiles.filter((tile) => tile.type === 'suit');
      expect(suitTiles.length).toBe(108); // 3 suits * 9 values * 4 copies

      // Check each suit has correct distribution
      const bambooTiles = suitTiles.filter((tile) => tile.suit === 'bamboo');
      const characterTiles = suitTiles.filter((tile) => tile.suit === 'character');
      const dotTiles = suitTiles.filter((tile) => tile.suit === 'dot');

      expect(bambooTiles.length).toBe(36);
      expect(characterTiles.length).toBe(36);
      expect(dotTiles.length).toBe(36);
    });

    it('should create correct honor tiles', async () => {
      const internalState = getInternalState(game);

      // Count honor tiles
      const allTiles = [...internalState.wall, ...Object.values(internalState.hands).flat()];

      const honorTiles = allTiles.filter((tile) => tile.type === 'honor');
      expect(honorTiles.length).toBe(28); // 7 honors * 4 copies

      // Check each honor type
      const honors = ['east', 'south', 'west', 'north', 'red', 'green', 'white'];
      for (const honor of honors) {
        const honorCount = honorTiles.filter((tile) => tile.honor === honor).length;
        expect(honorCount).toBe(4);
      }
    });

    it('should have unique tile IDs', async () => {
      const internalState = getInternalState(game);

      const allTiles = [...internalState.wall, ...Object.values(internalState.hands).flat()];

      const tileIds = allTiles.map((tile) => tile.id);
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
      expect(state.liveWallSize).toBeDefined();
      expect(state.supplementalDrawsUsed).toBe(0);
      expect(state.prevalentWind).toBe('east');
      expect(state.seatWinds.player1).toBe('east');
      expect(state.sessionScores).toEqual({ player1: 0, player2: 0, player3: 0, player4: 0 });
      expect(state.winningResult).toBeNull();
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

