# @llmletsplay/versus-chess Rules

These notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.

## Objective

Checkmate the opposing king.

## Players

2 players.

## Setup

- The engine starts from the standard 8x8 chess opening position.

## Turn Structure

- Players alternate legal moves, including captures, promotions, castling, and en passant when available.
- Moves that leave your own king in check are rejected.
- Check, checkmate, and stalemate state are tracked by the engine.

## End Of Game

- The game ends on checkmate or stalemate according to the current board state.
## Engine Notes

- Castling rights and en passant eligibility are persisted in state for restore and replay flows.
