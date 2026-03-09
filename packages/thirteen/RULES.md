# @llmletsplay/versus-thirteen Rules

These notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.

## Objective

Be the first player to shed every card from your hand.

## Players

2 to 4 players.

## Setup

- The deck is dealt across the table and the opening lead follows the package starting rules.

## Turn Structure

- Play a legal combination that beats the current table combination or pass when passing is allowed.
- The engine supports singles, pairs, triples, and straights covered by the current tests.
- When all other players pass, the table clears and the round leader starts a new trick.

## End Of Game

- The first player to empty their hand wins.
## Engine Notes

- The engine enforces the opening three-of-spades rule covered by the current suite.
