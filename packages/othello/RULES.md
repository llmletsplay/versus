# @llmletsplay/versus-othello Rules

These notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.

## Objective

Finish with more discs on the board than your opponent.

## Players

2 players.

## Setup

- The game starts from the standard 8x8 opening with four discs in the center.

## Turn Structure

- A legal move must bracket at least one opposing line of discs.
- All bracketed discs flip to the current player color when the move is made.
- If a player has no legal move, the engine can pass the turn.

## End Of Game

- The game ends when neither player can move and the higher disc count wins.