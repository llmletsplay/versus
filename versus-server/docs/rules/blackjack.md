# Blackjack Rules

## Overview

Blackjack (also known as 21) is a card game where players compete against the dealer to get a hand value as close to 21 as possible without exceeding it. It's one of the most popular casino card games worldwide.

## Objective

Beat the dealer by either:

- Getting a hand value closer to 21 than the dealer without going over
- Having the dealer bust (exceed 21) while your hand is still active
- Getting a blackjack (21 with first two cards) when dealer doesn't

## Card Values

- **Number cards (2-10)**: Face value
- **Face cards (J, Q, K)**: 10 points each
- **Ace**: 1 or 11 points (player's choice)
  - "Soft" hand: Ace counted as 11
  - "Hard" hand: Ace counted as 1

## Setup

- 1-7 players plus dealer
- Standard 52-card deck (often multiple decks: 1, 2, 4, 6, or 8)
- Each player plays independently against dealer
- Players place bets before cards are dealt

## Initial Deal

1. Each player receives two cards face up
2. Dealer receives one card face up, one face down (hole card)
3. Check for blackjacks:
   - Player blackjack: Ace + 10-value card = immediate win (unless dealer also has blackjack)
   - Dealer checks hole card if showing Ace or 10

## Player Actions

### Hit

- Request additional card
- Can hit multiple times
- Bust if total exceeds 21

### Stand

- Keep current hand
- End your turn
- Wait for dealer's play

### Double Down

- Double original bet
- Receive exactly one more card
- Usually restricted to initial two cards
- Some casinos allow only on 9, 10, or 11

### Split

- When dealt pair, split into two hands
- Requires additional bet equal to original
- Each hand played separately
- Aces often limited to one card each after split

### Surrender

- Forfeit half of bet and fold hand
- Only available as first decision
- Not offered at all casinos

### Insurance

- Side bet when dealer shows Ace
- Bet up to half of original wager
- Pays 2:1 if dealer has blackjack
- Generally poor odds for player

## Dealer Rules

- Must hit on 16 or less
- Must stand on 17 or more
- Some casinos: Dealer hits soft 17 (A-6)
- No choices - follows fixed rules

## Winning and Payouts

### Player Wins

- **Blackjack**: Pays 3:2 (some casinos 6:5)
- **Regular Win**: Pays 1:1
- **Insurance Win**: Pays 2:1

### Ties (Push)

- Same value as dealer
- Bet returned
- Blackjack vs blackjack is push

### Player Loses

- Bust (over 21)
- Dealer has higher total
- Lose entire bet

## Strategy Tips for AI

### Basic Strategy

Based on mathematical probabilities:

#### Hard Totals (No Ace or Ace = 1)

- **17-21**: Always stand
- **12-16**: Stand if dealer shows 2-6, hit if 7-Ace
- **11 or less**: Always hit (or double if allowed)

#### Soft Totals (Ace = 11)

- **Soft 19-21**: Always stand
- **Soft 18**: Stand vs 2-8, hit vs 9-Ace
- **Soft 17 or less**: Always hit

#### Pairs

- **Aces, 8s**: Always split
- **10s, 5s**: Never split
- **2s, 3s, 7s**: Split vs dealer 2-7
- **4s**: Split vs dealer 5-6
- **6s**: Split vs dealer 2-6
- **9s**: Split except vs 7, 10, Ace

### Card Counting Basics

For AI tracking:

- High cards (10, A) favor player
- Low cards (2-6) favor dealer
- Running count adjusts betting/playing decisions

### Advanced Considerations

- **Deck Penetration**: How deep into shoe before shuffle
- **Table Rules**: Variations affect optimal strategy
- **Bankroll Management**: Bet sizing based on advantage
- **Composition-Dependent**: Adjust for specific card combinations

## Rule Variations

### Common Variations

- **Dealer Hits/Stands on Soft 17**: Affects house edge
- **Double After Split**: Allowed/not allowed
- **Resplit Aces**: Usually not allowed
- **Surrender Options**: Early/late/none
- **Blackjack Payout**: 3:2 vs 6:5 (avoid 6:5)

### Side Bets

- **Perfect Pairs**: Matching pairs
- **21+3**: Poker hand with first 3 cards
- **Lucky Ladies**: Two queens of hearts
- Generally poor odds

## Special Situations

### Multiple Splits

- Some casinos allow resplitting to 3-4 hands
- Each requires additional bet
- Aces often limited to one resplit

### Even Money

- When player has blackjack and dealer shows Ace
- Guaranteed 1:1 payout instead of risking push
- Mathematically same as insurance

### Push 22

- Some variants: Dealer 22 pushes all non-busted hands
- Increases house edge significantly

## API Move Format

For initial bet:

```json
{
  "player": "player1",
  "action": "bet",
  "amount": 100
}
```

For game actions:

```json
{
  "player": "player1",
  "action": "hit",
  "handIndex": 0
}
```

For split hands:

```json
{
  "player": "player1",
  "action": "split",
  "handIndex": 0
}
```

For double down:

```json
{
  "player": "player1",
  "action": "double",
  "handIndex": 0
}
```

Valid actions: "hit", "stand", "double", "split", "surrender", "insurance"

## Game State Tracking

- Player hands and totals
- Dealer up card and hole card
- Current player turn
- Available actions per hand
- Bet amounts
- Split hand tracking
- Deck composition (for counting)
