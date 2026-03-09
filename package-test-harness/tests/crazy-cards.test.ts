import { describe, it, expect, beforeEach } from '@jest/globals';
import { CrazyCardsGame } from '../src/games/crazy-cards.js';
import { restoreGameState } from './helpers/restore-game-state.js';

type CrazyColor = 'red' | 'blue' | 'green' | 'yellow' | 'wild';
type CrazyValue =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'wild_draw4';

type CrazyCard = {
  color: CrazyColor;
  value: CrazyValue;
  id: string;
};

const createCard = (color: CrazyColor, value: CrazyValue, id: string): CrazyCard => ({
  color,
  value,
  id,
});

const createPlayer = (hand: CrazyCard[]) => ({
  hand,
  handSize: hand.length,
  hasCalledUno: false,
});

async function seedCrazyGame(
  game: CrazyCardsGame,
  overrides: Partial<Record<string, any>> = {}
): Promise<void> {
  const playerOrder = overrides.playerOrder ?? ['player1', 'player2'];
  await game.initializeGame({ playerCount: playerOrder.length });

  const player1Hand = overrides.player1Hand ?? [createCard('red', '7', 'p1-red-7')];
  const player2Hand = overrides.player2Hand ?? [createCard('blue', '4', 'p2-blue-4')];
  const deck = overrides.deck ?? [createCard('yellow', '9', 'deck-0')];
  const discardPile = overrides.discardPile ?? [createCard('red', '5', 'discard-red-5')];

  await restoreGameState(game, {
    players: {
      player1: createPlayer(player1Hand),
      player2: createPlayer(player2Hand),
    },
    deck,
    discardPile,
    currentPlayer: overrides.currentPlayer ?? 'player1',
    playerOrder,
    direction: overrides.direction ?? 1,
    currentColor: overrides.currentColor ?? discardPile[discardPile.length - 1]!.color,
    gameOver: false,
    winner: null,
    lastAction: overrides.lastAction ?? null,
    gamePhase: 'playing',
    pendingDraw: overrides.pendingDraw ?? 0,
    mustPlayDrawCard: overrides.mustPlayDrawCard ?? false,
    wildColorChoice: overrides.wildColorChoice ?? null,
    drawnCardId: overrides.drawnCardId ?? null,
    pendingWildDraw4Challenge: overrides.pendingWildDraw4Challenge ?? null,
  });
}

describe('CrazyCardsGame', () => {
  let game: CrazyCardsGame;

  beforeEach(() => {
    game = new CrazyCardsGame('test-game-id');
  });

  it('initializes with an ordinary starting discard and 7-card hands', async () => {
    const state = await game.initializeGame({ playerCount: 2 });
    const internalState = (game as any).currentState;

    expect(Object.keys(state.players)).toHaveLength(2);
    expect(internalState.players.player1.hand.length).toBe(7);
    expect(internalState.players.player2.hand.length).toBe(7);
    expect(internalState.discardPile[0].color).not.toBe('wild');
    expect(['skip', 'reverse', 'draw2']).not.toContain(internalState.discardPile[0].value);
  });

  it('plays a matching color card and advances turn', async () => {
    const redSeven = createCard('red', '7', 'p1-red-7');
    await seedCrazyGame(game, {
      player1Hand: [redSeven, createCard('yellow', '2', 'p1-yellow-2')],
      player2Hand: [createCard('blue', '4', 'p2-blue-4'), createCard('green', '6', 'p2-green-6')],
    });

    const state = await game.makeMove({
      player: 'player1',
      action: 'play',
      card: redSeven,
    });

    expect(state.topCard).toMatchObject(redSeven);
    expect(state.currentPlayer).toBe('player2');
    expect(state.gameOver).toBe(false);
    expect(state.winner).toBeNull();
  });

  it('rejects a card that matches neither color nor value', async () => {
    const invalidCard = createCard('blue', '9', 'p1-blue-9');
    await seedCrazyGame(game, {
      player1Hand: [invalidCard],
      player2Hand: [createCard('green', '6', 'p2-green-6')],
      discardPile: [createCard('red', '5', 'discard-red-5')],
    });

    const result = await game.validateMove({
      player: 'player1',
      action: 'play',
      card: invalidCard,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Card must match color (red) or value (5)');
  });

  it('requires a chosen color for wild cards', async () => {
    const wildCard = createCard('wild', 'wild', 'p1-wild');
    await seedCrazyGame(game, {
      player1Hand: [wildCard],
      player2Hand: [createCard('green', '6', 'p2-green-6')],
    });

    const result = await game.validateMove({
      player: 'player1',
      action: 'play',
      card: wildCard,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Must choose a non-wild color');
  });

  it('only allows the drawn card to be played after drawing', async () => {
    const existingPlayable = createCard('red', '7', 'p1-red-7');
    const drawnPlayable = createCard('red', '1', 'deck-red-1');
    await seedCrazyGame(game, {
      player1Hand: [existingPlayable],
      player2Hand: [createCard('green', '6', 'p2-green-6')],
      deck: [drawnPlayable, createCard('yellow', '3', 'deck-yellow-3')],
    });

    await game.makeMove({
      player: 'player1',
      action: 'draw',
    });

    const wrongCardResult = await game.validateMove({
      player: 'player1',
      action: 'play',
      card: existingPlayable,
    });
    expect(wrongCardResult.valid).toBe(false);
    expect(wrongCardResult.error).toBe('Can only play the card you just drew');

    const drawnCardResult = await game.validateMove({
      player: 'player1',
      action: 'play',
      card: drawnPlayable,
    });
    expect(drawnCardResult.valid).toBe(true);
  });

  it('only allows passing after a normal draw', async () => {
    await seedCrazyGame(game, {
      deck: [createCard('yellow', '1', 'deck-yellow-1')],
    });

    const beforeDraw = await game.validateMove({
      player: 'player1',
      action: 'pass',
    });
    expect(beforeDraw.valid).toBe(false);
    expect(beforeDraw.error).toBe('Can only pass after drawing a card');

    await game.makeMove({
      player: 'player1',
      action: 'draw',
    });

    const afterDraw = await game.validateMove({
      player: 'player1',
      action: 'pass',
    });
    expect(afterDraw.valid).toBe(true);

    const state = await game.makeMove({
      player: 'player1',
      action: 'pass',
    });
    expect(state.currentPlayer).toBe('player2');
  });

  it('forces the next player to draw a draw-two penalty instead of stacking', async () => {
    const drawTwo = createCard('red', 'draw2', 'p1-draw2');
    const counterDrawTwo = createCard('blue', 'draw2', 'p2-draw2');
    await seedCrazyGame(game, {
      player1Hand: [drawTwo, createCard('yellow', '7', 'p1-yellow-7')],
      player2Hand: [counterDrawTwo, createCard('green', '2', 'p2-green-2')],
      deck: [
        createCard('yellow', '4', 'deck-yellow-4'),
        createCard('green', '8', 'deck-green-8'),
        createCard('blue', '3', 'deck-blue-3'),
      ],
    });

    await game.makeMove({
      player: 'player1',
      action: 'play',
      card: drawTwo,
    });

    const stackAttempt = await game.validateMove({
      player: 'player2',
      action: 'play',
      card: counterDrawTwo,
    });
    expect(stackAttempt.valid).toBe(false);
    expect(stackAttempt.error).toBe('Must draw the penalty cards');

    const state = await game.makeMove({
      player: 'player2',
      action: 'draw',
    });

    expect(state.currentPlayer).toBe('player1');
    expect(state.pendingDraw).toBe(0);
    expect((game as any).currentState.players.player2.hand.length).toBe(4);
  });

  it('resolves a successful Wild Draw 4 challenge against an illegal play', async () => {
    const matchingColorCard = createCard('red', '9', 'p1-red-9');
    const wildDrawFour = createCard('wild', 'wild_draw4', 'p1-wild-draw4');
    await seedCrazyGame(game, {
      player1Hand: [matchingColorCard, wildDrawFour],
      player2Hand: [createCard('blue', '4', 'p2-blue-4')],
      deck: [
        createCard('yellow', '1', 'deck-yellow-1'),
        createCard('yellow', '2', 'deck-yellow-2'),
        createCard('yellow', '3', 'deck-yellow-3'),
        createCard('yellow', '4', 'deck-yellow-4'),
      ],
    });

    await game.makeMove({
      player: 'player1',
      action: 'play',
      card: wildDrawFour,
      chosenColor: 'blue',
    });

    const validation = await game.validateMove({
      player: 'player2',
      action: 'challenge',
    });
    expect(validation.valid).toBe(true);

    const state = await game.makeMove({
      player: 'player2',
      action: 'challenge',
    });

    expect(state.currentPlayer).toBe('player2');
    expect(state.pendingDraw).toBe(0);
    expect((game as any).currentState.players.player1.hand.length).toBe(5);
    expect((game as any).currentState.players.player2.hand.length).toBe(1);
    expect(state.lastAction?.details).toContain('successfully challenged');
  });

  it('resolves a failed Wild Draw 4 challenge against a legal play', async () => {
    const nonMatchingCard = createCard('blue', '9', 'p1-blue-9');
    const wildDrawFour = createCard('wild', 'wild_draw4', 'p1-wild-draw4');
    await seedCrazyGame(game, {
      player1Hand: [nonMatchingCard, wildDrawFour],
      player2Hand: [createCard('blue', '4', 'p2-blue-4')],
      deck: [
        createCard('yellow', '1', 'deck-yellow-1'),
        createCard('yellow', '2', 'deck-yellow-2'),
        createCard('yellow', '3', 'deck-yellow-3'),
        createCard('yellow', '4', 'deck-yellow-4'),
        createCard('yellow', '5', 'deck-yellow-5'),
        createCard('yellow', '6', 'deck-yellow-6'),
      ],
    });

    await game.makeMove({
      player: 'player1',
      action: 'play',
      card: wildDrawFour,
      chosenColor: 'blue',
    });

    const state = await game.makeMove({
      player: 'player2',
      action: 'challenge',
    });

    expect(state.currentPlayer).toBe('player1');
    expect(state.pendingDraw).toBe(0);
    expect((game as any).currentState.players.player2.hand.length).toBe(7);
    expect(state.lastAction?.details).toContain('failed to challenge');
  });

  it('treats reverse as a skip in a two-player game', async () => {
    const reverse = createCard('red', 'reverse', 'p1-reverse');
    await seedCrazyGame(game, {
      player1Hand: [reverse, createCard('yellow', '7', 'p1-yellow-7')],
      player2Hand: [createCard('green', '2', 'p2-green-2')],
    });

    const state = await game.makeMove({
      player: 'player1',
      action: 'play',
      card: reverse,
    });

    expect(state.currentPlayer).toBe('player1');
    expect(state.direction).toBe(-1);
  });

  it('only allows calling Uno with exactly two cards in hand', async () => {
    await seedCrazyGame(game, {
      player1Hand: [createCard('red', '7', 'p1-red-7'), createCard('blue', '7', 'p1-blue-7')],
      player2Hand: [createCard('green', '2', 'p2-green-2')],
    });

    const validCall = await game.validateMove({
      player: 'player1',
      action: 'uno',
    });
    expect(validCall.valid).toBe(true);

    await seedCrazyGame(game, {
      player1Hand: [createCard('red', '7', 'solo-card')],
      player2Hand: [createCard('green', '2', 'p2-green-2')],
    });

    const invalidCall = await game.validateMove({
      player: 'player1',
      action: 'uno',
    });
    expect(invalidCall.valid).toBe(false);
    expect(invalidCall.error).toBe('Can only call Uno when you have 2 cards left');
  });
});
