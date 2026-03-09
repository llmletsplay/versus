# @versus/mahjong Rules

These notes describe the gameplay currently implemented by this package so downstream apps know exactly what the engine expects.

## Objective

Complete a Chinese Official winning hand and outscore the table through fan-based payments.

## Players

2 to 4 players.

## Setup

- The package uses a 136-tile set without flowers or seasons.
- Players begin with 13 tiles and the dealer starts with 14.
- Seats are assigned east, south, west, and north in player-order sequence, and the round starts with east as the prevalent wind.
- The engine reserves a dead-wall tail for kan replacement draws and treats the remaining tiles as the live wall.

## Turn Structure

- If you hold 13 effective tiles on your turn, draw from the live wall.
- If you hold 14 effective tiles across your concealed hand and open melds, discard one tile.
- After a discard, eligible opponents may declare win, claim pon, claim kan, or the next player may claim chi before the next draw.
- Players may declare concealed or added kan on their own turn, then immediately take a supplemental draw from the dead-wall reserve.
- A winning declaration must satisfy both hand structure and the Chinese Official 8-fan minimum implemented by the engine.

## End Of Game

- The engine accepts standard four-meld-plus-pair hands and seven pairs as winning hands.
- Winning state includes a fan breakdown, total fan, and per-player payment obligations.
- If the live wall is exhausted after claim resolution, the round ends in an exhaustive draw.
## Engine Notes

- Open melds are tracked in state and reduce the concealed tiles needed for later winning-hand validation.
- Kan melds count as a single meld for turn-flow and hand-validation purposes while still preserving the fourth tile in state.
- The current scoring surface includes common Chinese Official patterns such as All Pungs, Full Flush, Seven Pairs, dragon pungs, wind pungs, concealed-hand bonuses, and terminal-or-honor pung bonuses.

## Scope Notes

- The package now targets Chinese Official scoring, but it does not yet cover the full official fan catalog or multi-round wind progression.
