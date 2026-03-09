# @versus/battleship Rules

These notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.

## Objective

Sink every opposing ship before your own fleet is sunk.

## Players

2 players.

## Setup

- The engine initializes a 10x10 board for each player and auto-places the standard five-ship fleet.
- Public state hides intact enemy ship locations.

## Turn Structure

- The current player chooses a target coordinate on the opponent board.
- Hits, misses, and sunk ships are tracked automatically.
- A miss passes the turn and a hit keeps the firing pressure on the same battle state.

## End Of Game

- The game ends when one player has no ships remaining afloat.
## Engine Notes

- This package exposes ship status while still sanitizing hidden information in public state.

## Scope Notes

- The engine auto-places fleets rather than asking each player to position ships manually.
