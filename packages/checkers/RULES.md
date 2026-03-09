# @llmletsplay/versus-checkers Rules

These notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.

## Objective

Capture or immobilize the opposing side.

## Players

2 players.

## Setup

- The engine starts from the standard 8x8 opening position on the dark squares.

## Turn Structure

- Men move diagonally forward into open squares.
- Captures are made by jumping opposing pieces.
- Pieces that reach the far back rank are promoted to kings and can move diagonally in both directions.

## End Of Game

- You win when the opponent has no legal moves or no remaining pieces.