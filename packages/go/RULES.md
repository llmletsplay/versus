# @versus/go Rules

These notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.

## Objective

Finish with the better score through territory, captures, and komi.

## Players

2 players.

## Setup

- The board starts empty with Black to play first and komi assigned to White.

## Turn Structure

- Players place a stone on an empty intersection or pass.
- Groups with no liberties are captured and removed.
- Immediate ko recapture is rejected and suicide is only allowed when the move captures opposing stones.

## End Of Game

- After two consecutive passes, the engine scores territory plus captures and applies komi.
## Engine Notes

- The package persists pass count, capture totals, ko position, and computed territory.
