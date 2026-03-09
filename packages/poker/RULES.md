# @versus/poker Rules

These notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.

## Objective

Win chips by taking the pot uncontested or by showing the best hand at showdown.

## Players

2 to 10 players.

## Setup

- The package posts small and big blinds automatically.
- Each player receives two private hole cards.

## Turn Structure

- Betting proceeds through preflop, flop, turn, river, and showdown phases.
- Players may fold, check, call, raise, or move all-in when the state allows it.
- Community cards are revealed street by street and the engine evaluates the best five-card hand at showdown.

## End Of Game

- A hand ends when one player remains or showdown resolves the winning hand.
## Engine Notes

- This engine models no-limit Texas Hold'em turn flow, blind posting, and hand ranking.
