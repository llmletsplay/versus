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
- After a discard, eligible opponents may declare win, claim pon, claim kan, or the next player may claim chi before the next draw unless the last live-wall tile has already been drawn.
- Players may declare concealed or added kan on their own turn, with robbing-the-kong windows on added kan and supplemental draws from the dead-wall reserve.
- A winning declaration must satisfy both hand structure and the Chinese Official 8-fan minimum implemented by the engine.

## End Of Game

- The engine accepts standard hands, seven pairs, thirteen orphans, nine gates, and seven shifted pairs as winning hands.
- Winning state includes a fan breakdown, total fan, per-player payment obligations, and running session scores.
- Finished hands can continue through startNextHand(), which rotates dealer and seat winds while advancing the prevalent wind by round.
## Engine Notes

- Open melds are tracked in state and reduce the concealed tiles needed for later winning-hand validation.
- Kan melds count as a single meld for turn-flow and hand-validation purposes while still preserving the fourth tile in state.
- The implemented scoring surface now includes core Chinese Official patterns plus last-tile bonuses, out-with-replacement-tile, robbing the kong, and several top-tier closed hands.

## Scope Notes

- The package now supports multi-hand dealer/prevalent-wind progression, but it still does not cover the full official fan catalog or side-settlement cases such as kong bonuses and exhaustive-draw ready-hand payments.
