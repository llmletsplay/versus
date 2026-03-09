# @versus/go-fish Rules

These notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.

## Objective

Collect more completed books than the other players.

## Players

2 to 6 players.

## Setup

- Players are dealt hands from a standard deck.
- The remaining cards form the draw pile.

## Turn Structure

- Ask another player for a rank that you already hold.
- If they have matching cards, they must hand them over and you continue.
- If they do not, you go fish from the deck and the draw resolves the turn.

## End Of Game

- When the deck and hands are exhausted, the player with the most books wins.