# @llmletsplay/versus-catan Rules

These notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.

## Objective

Reach 10 victory points through settlements, cities, development cards, and bonuses.

## Players

3 to 4 players.

## Setup

- Players place starting settlements and roads in snake order during the setup phase.
- Second-round setup settlements award starting resources from adjacent producing hexes.

## Turn Structure

- Roll dice to resolve production or robber flow.
- After rolling, the current player may trade, build, or play one eligible development card.
- A roll of 7 requires each affected player to choose exact discards before the robber is moved.

## End Of Game

- The first player to reach 10 victory points wins.
## Engine Notes

- Development-card effects are chosen explicitly in move input so downstream apps can stay deterministic.
- The board graph uses the full 19-hex, 54-intersection, 72-edge topology, the official nine-harbor distribution, and recalculates longest road from the actual road network.
- Maritime trade honors the standard 4:1 bank rate plus 3:1 and 2:1 harbor discounts when the player controls the matching coast.
