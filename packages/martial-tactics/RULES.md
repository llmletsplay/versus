# @versus/martial-tactics Rules

These notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.

## Objective

Capture the opposing master or move your master into the rival temple square.

## Players

2 players.

## Setup

- Each side starts with four students and one master on a 5x5 board.
- Each player receives two move cards and one neutral move card sits beside the board.

## Turn Structure

- Choose one of your two move cards and move a matching piece pattern.
- After the move, swap the used card with the neutral card.
- Captures remove opposing pieces from the board.

## End Of Game

- You win by capturing the opposing master or reaching the opposing temple square with your own master.
## Engine Notes

- The package is intended for Onitama-style play without depending on any platform-specific logic.
