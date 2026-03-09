# @versus/bingo Rules

These notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.

## Objective

Complete an active winning pattern on your card before the rest of the table.

## Players

2 to 20 players.

## Setup

- Each player receives a generated 5x5 card with a free center square.
- The game can use the default pattern set or custom criteria supplied in the initial config.

## Turn Structure

- Start the round before any calls are made.
- Call one valid Bingo number at a time.
- Players mark matching cells and may claim bingo when they satisfy a configured pattern.

## End Of Game

- Any player who satisfies an active pattern and claims bingo is recorded as a winner.
## Engine Notes

- The package supports multiple winners and custom pattern definitions.
