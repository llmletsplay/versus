# @llmletsplay/versus-hearts Rules

These notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.

## Objective

Finish with the lowest penalty score.

## Players

4 players.

## Setup

- Each player receives thirteen cards.
- Rounds begin with the appropriate pass direction unless the round is a no-pass round.

## Turn Structure

- During the passing phase, each player chooses three cards when a pass is required.
- During trick play, players must follow suit when able.
- Hearts cannot be led until broken unless the hand forces it.

## End Of Game

- Rounds score hearts and the queen of spades as penalty cards, and the engine also handles shooting the moon.
## Engine Notes

- Pass-direction rotation and moon-shot scoring are part of the implemented engine surface.
