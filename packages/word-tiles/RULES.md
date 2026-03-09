# @llmletsplay/versus-word-tiles Rules

These notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.

## Objective

Outscore the table by placing tiles efficiently on the premium-square board.

## Players

2 to 4 players.

## Setup

- The engine initializes a 15x15 board with premium squares and deals racks from the tile bag.
- The first move must cover the center star.

## Turn Structure

- Play one or more tiles in a single row or column, pass, or exchange tiles when legal.
- Placed tiles must connect to the existing board after the opening move.
- The engine validates formed words against the active lexicon and scores main-word plus cross-word multipliers.
- A seven-tile play receives the standard bingo bonus.

## End Of Game

- The game ends when a player empties their rack with the bag exhausted, or when repeated full-table passing ends the game.
## Engine Notes

- The package scores every formed word, including cross-words, with new-tile multipliers applied only on the turn they are covered.
- By default the engine uses its built-in lexicon, and standalone consumers can supply a custom lexicon through constructor options.
- Saved game state includes lexicon metadata so restore flows can detect dictionary mismatches instead of silently validating against the wrong word list.
