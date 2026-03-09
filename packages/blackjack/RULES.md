# @versus/blackjack Rules

These notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.

## Objective

Beat the dealer without going over 21.

## Players

1 player versus the dealer.

## Setup

- The engine deals two cards to the player and two to the dealer.
- One dealer card stays hidden until the resolution phase.

## Turn Structure

- The player chooses hit, stand, double, or split when legal for the current hand state.
- Once the player stands or busts, the dealer reveals and draws according to dealer rules.
- Hand values treat aces flexibly as 1 or 11.

## End Of Game

- The round ends after all hands resolve and the package determines the winner and payout result.
## Engine Notes

- Dealer logic hits on 16 and stands on 17 in the current engine surface.

## Scope Notes

- This package models a single player against the dealer, not a multi-seat table.
