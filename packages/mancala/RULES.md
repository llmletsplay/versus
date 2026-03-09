# @llmletsplay/versus-mancala Rules

These notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.

## Objective

Finish with more stones in your store than your opponent.

## Players

2 players.

## Setup

- The board starts with the standard six pits and one store per side.

## Turn Structure

- Choose a non-empty pit on your side and sow its stones counterclockwise.
- Landing in your own store grants an extra turn.
- Landing in an empty pit on your side can capture stones from the opposite pit.

## End Of Game

- When one side of pits is empty, remaining stones are collected and the larger store total wins.