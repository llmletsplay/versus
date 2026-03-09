# @llmletsplay/versus-bullshit Rules

These notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.

## Objective

Be the first player to empty your hand and survive any valid challenge.

## Players

3 to 8 players.

## Setup

- A standard 52-card deck is dealt across the table.
- Play starts on rank A and advances in order after each claim.

## Turn Structure

- On your turn, play one or more cards face down while claiming the current rank.
- Other players may challenge the claim after the play is made.
- A successful challenge punishes the liar and a failed challenge punishes the challenger.

## End Of Game

- A player wins immediately when they empty their hand at a legally resolved point in the round.
## Engine Notes

- The engine enforces turn order, legal claim rank, and challenge timing.
