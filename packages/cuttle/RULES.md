# @llmletsplay/versus-cuttle Rules

These notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.

## Objective

Reach 21 field points before your opponent.

## Players

2 to 4 players.

## Setup

- Players draw six cards from a standard deck.
- Each player begins with an empty field, face-card area, and scrap contribution.

## Turn Structure

- Play a point card, play a face card for an ongoing effect, scuttle an opposing point card, use a targeted effect, or pass.
- Card rank determines point value or special behavior.
- The engine tracks field cards, face cards, scrap, and score totals automatically.

## End Of Game

- A player wins when their field reaches 21 points.
## Engine Notes

- Only point cards contribute to score and face cards provide effects rather than score.
