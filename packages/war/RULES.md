# @versus/war Rules

These notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.

## Objective

Collect every card in play.

## Players

2 to 4 players.

## Setup

- The shuffled deck is split across the active players.

## Turn Structure

- Each player reveals the top card of their stack.
- The highest revealed rank wins the pot.
- Ties trigger war resolution with extra cards added to the same pot until the tie breaks or a player runs out.

## End Of Game

- The game ends when only one player still holds cards.
## Engine Notes

- The engine keeps a single carried pot across chained war rounds so card totals stay consistent.
