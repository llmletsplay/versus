# @llmletsplay/versus-crazy-cards Rules

These notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.

## Objective

Be the first player to empty your hand.

## Players

2 to 10 players.

## Setup

- Each player starts with seven cards.
- The discard pile begins with a normal non-wild, non-action starter card.

## Turn Structure

- Play a card that matches the current color or value, or play a wild while choosing the next color.
- If you cannot play, draw a card and then either play the drawn card or pass if allowed.
- Action cards apply skip, reverse, draw-two, and wild-draw-four effects.

## End Of Game

- The first player to play their last card wins.
## Engine Notes

- This package intentionally uses a neutral name and documents itself as UNO-style rather than official UNO.

## Scope Notes

- The engine does not support stacking draw penalties.
