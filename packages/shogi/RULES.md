# @llmletsplay/versus-shogi Rules

These notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.

## Objective

Checkmate the opposing king.

## Players

2 players.

## Setup

- The engine starts from the standard 9x9 opening arrangement.

## Turn Structure

- Players alternate legal moves and may promote eligible pieces when moving into, within, or out of the promotion zone.
- Captured pieces change ownership and may later be dropped back onto the board.
- The engine rejects moves that leave your own king in check.

## End Of Game

- The game ends on checkmate.
## Engine Notes

- Pawn-drop mate enforcement, nifu, promotion handling, and drop restrictions are part of the implemented surface.
