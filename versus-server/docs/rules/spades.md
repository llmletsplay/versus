# Spades Rules

## Overview
Spades is a partnership trick-taking card game where players bid on the number of tricks they expect to win. Spades are always the trump suit, outranking all other suits.

## Objective
Be the first partnership to reach 500 points by accurately bidding and winning tricks. Points are earned by meeting bid contracts and lost for failing to meet them.

## Setup
- 4 players in 2 partnerships (North/South vs East/West)
- Partners sit opposite each other
- Standard 52-card deck
- Deal 13 cards to each player
- Spades are always trump

## Bidding Phase

### Bid Order
- Bidding starts with player left of dealer
- Each player bids number of tricks they expect to win (0-13)
- No suit is named - spades are always trump
- Partnership bid = sum of both partners' bids

### Special Bids
- **Nil (0)**: Player bids to win zero tricks
  - Success: +100 points
  - Failure: -100 points
- **Blind Nil**: Bid nil before looking at cards
  - Success: +200 points
  - Failure: -200 points
  - Usually only allowed when behind by 100+ points

## Gameplay

### Leading
- Player left of dealer leads first trick
- Spades cannot be led until "broken" (played on another suit)
- Exception: Player may lead spades if only spades remain

### Following Suit
- Must follow suit if possible
- If void in led suit, may play any card including spades
- Spades beat all other suits (trump)

### Winning Tricks
- Highest spade wins (if any played)
- Otherwise, highest card of led suit wins
- Winner leads next trick

## Scoring

### Making Contract
- Base score = 10 × bid
- Each overtrick (trick beyond bid) = 1 point
- Example: Bid 5, make 7 = 50 + 2 = 52 points

### Failing Contract (Set)
- Lose 10 points per bid trick
- Example: Bid 6, make 4 = -60 points

### Bags (Overtricks)
- Overtricks accumulate as "bags"
- Every 10 bags = -100 points penalty
- Bags carry over between hands

### Nil Scoring
- Successful nil: +100 points (partner scores normally)
- Failed nil: -100 points (partner scores normally)
- If nil bidder takes tricks, those count toward partnership total

## Winning Conditions
- First partnership to 500+ points wins
- If both reach 500+ in same hand, highest score wins
- Common variants: Play to 300, 1000, or specific number of hands

## Strategy Tips for AI

### Bidding Strategy
- Count high cards (Aces, Kings) as likely tricks
- Count spades carefully - low spades often win late
- Consider partner's typical bidding patterns
- Bid conservatively to avoid sets
- Factor in position (4th bidder has more information)

### Nil Strategy
- Need very low cards and short suits
- Partner must play aggressively to cover
- Dangerous with any spade above 5
- Watch for nil attempts and attack them

### Card Play
- **Leading**: Lead low to draw out high cards
- **Trump Management**: Save spades for crucial moments
- **Counting**: Track spades played (only 13 total)
- **Covering Partner**: Help partner make bid before taking extra tricks

### Partnership Communication
- First few tricks reveal hand strength
- Playing high cards early signals strength
- Playing unexpectedly low might signal nil attempt
- Help partner avoid bags when contract is secure

### Advanced Tactics
- **Setting Opponents**: Force them to take unwanted tricks
- **Bag Management**: Balance between safety and avoiding bags
- **Endgame**: Count remaining cards to ensure contract
- **Board Control**: Sometimes take control to help partner

## Special Situations

### Breaking Spades
- Spades are "broken" when:
  - Player is void in led suit and plays a spade
  - Player has only spades remaining
- Strategic timing of breaking spades is crucial

### Reneging
- Failing to follow suit when able
- Major penalty (typically lose hand or game)
- AI must carefully track legal plays

### Blind Bidding Variants
- Some games allow viewing cards before bidding
- Others require blind bidding
- Changes strategy significantly

## API Move Format

For bidding:
```json
{
  "player": "North",
  "action": "bid",
  "amount": 4
}
```

For nil bid:
```json
{
  "player": "North",
  "action": "bid",
  "amount": 0,
  "nil": true
}
```

For playing cards:
```json
{
  "player": "North",
  "action": "play",
  "card": {
    "suit": "spades",
    "rank": "ace"
  }
}
```

## Game State Tracking
- Current trick leader
- Cards played in current trick
- Tricks won by each player
- Partnership bids and current tricks
- Whether spades have been broken
- Running bag count
- Score for each partnership