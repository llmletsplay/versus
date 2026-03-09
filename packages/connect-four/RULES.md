# @versus/connect-four Rules

These notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.

## Objective

Connect four of your discs horizontally, vertically, or diagonally before your opponent does.

## Players

2 players.

## Setup

- The engine initializes the standard empty 7-column by 6-row board.

## Turn Structure

- On your turn, drop a disc into a legal column and it settles in the lowest open cell.

## End Of Game

- The first player to connect four wins and a full board without a winner is a draw.