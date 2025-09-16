# Hearts Rules

## Overview
Hearts is a trick-taking card game typically played with 4 players where the goal is to avoid winning certain cards that carry penalty points. It's a game of strategic card management and careful timing.

## Objective
Have the lowest score when any player reaches 100 points. Players try to avoid winning tricks containing hearts (1 point each) and the Queen of Spades (13 points).

## Setup
- 4 players (North, East, South, West)
- Standard 52-card deck
- Deal 13 cards to each player
- Players arrange cards by suit and rank

## Card Passing
Before each hand (except every 4th hand):
- **1st hand**: Pass 3 cards to player on left
- **2nd hand**: Pass 3 cards to player on right
- **3rd hand**: Pass 3 cards to player across
- **4th hand**: No passing (hold 'em)
- Pattern repeats

## Gameplay

### Starting the Game
- Player with 2 of Clubs leads first trick
- Must play 2 of Clubs on first trick
- Play proceeds clockwise

### Following Suit
- Must follow suit if possible
- If void in led suit, may play any card (with restrictions below)
- Highest card of led suit wins the trick
- Winner leads next trick

### Point Cards Restrictions
- **Hearts**: Cannot be led until "broken" (someone plays a heart when void in led suit)
- **First Trick**: No point cards allowed (no hearts or Queen of Spades)
- **Queen of Spades**: Can be played anytime following suit rules

## Scoring

### Regular Scoring
- Each heart = 1 point
- Queen of Spades = 13 points
- Total possible points per hand = 26

### Shooting the Moon
- If one player takes ALL 26 points in a hand:
  - Option 1: That player gets 0 points, all others get 26
  - Option 2: That player subtracts 26 from their score
- High-risk, high-reward strategy

## Winning Conditions
- Game ends when any player reaches or exceeds 100 points
- Player with lowest score wins
- In case of tie, play additional hand(s) until tie is broken

## Strategy Tips for AI

### Card Passing Strategy
- Pass high spades (especially Ace, King) to avoid Queen of Spades
- Pass high hearts to avoid taking heart tricks
- Keep low cards for ducking tricks
- Consider keeping/passing based on position

### Early Game
- Try to void a suit during passing phase
- Play high cards early when safe
- Track Queen of Spades location
- Count cards to know what's been played

### Mid Game
- Avoid leading low spades (might draw out Queen)
- Lead low cards to stay safe
- If holding Queen of Spades, find safe opportunity to play it
- Watch for shooting the moon attempts

### Late Game
- Count points taken by each player
- Block shooting the moon attempts
- Carefully manage remaining high cards
- Consider taking a few points to prevent opponent from shooting

### Advanced Tactics
- **Ducking**: Playing low to avoid winning tricks
- **Bleeding Spades**: Force Queen of Spades out safely
- **Counting Cards**: Track played cards, especially in critical suits
- **Defensive Play**: Sometimes take points to prevent shooting the moon

## Special Situations

### Breaking Hearts
- Hearts cannot lead until:
  - A heart is played when player is void in led suit
  - Only hearts remain in player's hand
- Strategic timing of breaking hearts is crucial

### Queen of Spades Strategy
- Dangerous to hold after spades are led 2-3 times
- Try to play when someone else will win trick
- Leading Queen is extremely risky

## API Move Format
```json
{
  "player": "North",
  "action": "play",
  "card": {
    "suit": "hearts",
    "rank": "queen"
  }
}
```

For passing phase:
```json
{
  "player": "North",
  "action": "pass",
  "cards": [
    {"suit": "spades", "rank": "ace"},
    {"suit": "spades", "rank": "king"},
    {"suit": "hearts", "rank": "king"}
  ]
}
```

## Game State Tracking
- Current trick leader
- Cards played in current trick
- Points taken by each player
- Whether hearts have been broken
- Cards remaining in each player's hand
- Passing direction for current hand