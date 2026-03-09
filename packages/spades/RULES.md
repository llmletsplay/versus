# @llmletsplay/versus-spades Rules

These notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.

## Objective

Outscore the opposing partnership through accurate bids and trick play.

## Players

4 players in fixed partnerships.

## Setup

- Cards are dealt evenly to the four seats.
- Each player submits a bid before trick play starts.

## Turn Structure

- Players follow suit when possible during each trick.
- Spades are trump and cannot be led until broken unless the hand forces it.
- The engine tracks nil, blind nil, bags, partnership scores, and trick winners.

## End Of Game

- The game ends when a partnership reaches the configured winning threshold, with score and bag penalties applied.