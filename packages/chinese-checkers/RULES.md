# @llmletsplay/versus-chinese-checkers Rules

These notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.

## Objective

Move all 10 of your marbles into the opposite home triangle.

## Players

2, 3, 4, or 6 players.

## Setup

- The engine initializes the official 17-row star board with 121 valid holes.
- Supported player counts use the classic opposing home-triangle layouts for 2, 3, 4, and 6 players.

## Turn Structure

- A move may be one adjacent step along the six-direction lattice into an empty hole.
- A move may also be a chained jump sequence over occupied neighboring holes into empty landing holes.
- The engine validates full jump chains as a single move and tracks the opposite target triangle for each seat.

## End Of Game

- You win when all 10 of your marbles occupy your opposite home triangle.
## Engine Notes

- Public state exposes the sparse star-board layout through the board matrix and validPositions list.
