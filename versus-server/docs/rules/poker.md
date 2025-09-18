# Texas Hold'em Poker Rules

## Overview

Texas Hold'em is a poker variant where players make the best 5-card hand using any combination of their 2 private cards and 5 community cards.

## Objective

Win chips by either having the best hand at showdown or by making all other players fold.

## Setup

- 2-10 players at a table
- Each player receives 2 private "hole" cards
- 5 community cards dealt face-up in the center
- Standard 52-card deck (no jokers)

## Hand Rankings (Highest to Lowest)

1. **Royal Flush**: A, K, Q, J, 10 all same suit
2. **Straight Flush**: Five consecutive cards, same suit
3. **Four of a Kind**: Four cards of same rank
4. **Full House**: Three of a kind + pair
5. **Flush**: Five cards of same suit (non-consecutive)
6. **Straight**: Five consecutive cards (mixed suits)
7. **Three of a Kind**: Three cards of same rank
8. **Two Pair**: Two different pairs
9. **One Pair**: Two cards of same rank
10. **High Card**: Highest single card when no other hand is made

## Betting Rounds

### Pre-Flop

- Players receive 2 hole cards
- Betting starts left of big blind
- Options: fold, call, raise

### The Flop

- 3 community cards dealt face-up
- Betting starts with first active player left of dealer
- Options: check, bet, call, raise, fold

### The Turn

- 4th community card dealt
- Another round of betting
- Same options as flop

### The River

- 5th and final community card dealt
- Final round of betting
- Same options as previous rounds

### Showdown

- Remaining players reveal hands
- Best 5-card hand wins the pot
- Players can use any combination of their 2 cards + 5 community cards

## Betting Actions

### Check

- Pass the action without betting (only if no one has bet)

### Bet

- Put chips into the pot (first action in a round)

### Call

- Match the current bet amount

### Raise

- Increase the bet amount (minimum: double the current bet)

### Fold

- Give up cards and forfeit any claim to the pot

## Blind Structure

- **Small Blind**: Forced bet (typically half of big blind)
- **Big Blind**: Forced bet that sets minimum bet size
- Blinds rotate clockwise each hand

## Position Names

- **Button/Dealer**: Last to act post-flop (best position)
- **Small Blind**: First blind, first to act post-flop
- **Big Blind**: Second blind, last to act pre-flop
- **Under the Gun**: First to act pre-flop
- **Cut-off**: One seat right of button

## All-In Rules

- Player can bet all remaining chips at any time
- Creates side pots if other players have more chips
- All-in player can only win amount they contributed to each pot

## Strategy Tips for AI

### Pre-Flop

- Play tight from early position, looser from late position
- Raise with premium hands: AA, KK, QQ, AK
- Consider position when deciding to play marginal hands
- Fold weak hands from early position

### Post-Flop

- Continuation bet when you were the pre-flop raiser
- Pay attention to board texture (wet vs. dry boards)
- Consider pot odds when facing bets
- Bluff selectively, especially on coordinated boards

### General Strategy

- Position is crucial - late position allows more information
- Observe betting patterns and player tendencies
- Manage bankroll - don't play beyond your limits
- Control pot size with marginal hands
- Value bet strong hands, bluff with good drawing hands

## Common Scenarios

### Drawing Hands

- **Flush Draw**: 4 cards to a flush (9 outs)
- **Straight Draw**: 4 cards to a straight (8 outs)
- **Combo Draw**: Flush + straight draws (15+ outs)

### Pot Odds Calculation

- Compare cost to call vs. pot size
- Example: $10 to call into $50 pot = 5:1 odds
- Need 16.7% chance to win (1/6) to break even

## API Move Format

```json
{
  "player": "player1",
  "action": "raise",
  "amount": 100,
  "type": "betting"
}
```

Valid actions: "fold", "check", "call", "bet", "raise", "all-in"
