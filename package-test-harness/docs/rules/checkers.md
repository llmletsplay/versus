# Checkers Rules

## Overview

Checkers (also known as Draughts) is a classic strategy board game played on an 8×8 board where players move diagonal pieces with the goal of capturing all opponent pieces or blocking all their moves.

## Objective

Win by either:

- Capturing all opponent pieces
- Blocking all opponent's legal moves
- Having more pieces when neither player can win

## Setup

- 8×8 checkered board (64 squares)
- Only dark squares are used (32 playable squares)
- Each player starts with 12 pieces
- Red/Black or White/Black pieces
- Pieces placed on dark squares of first 3 rows
- Board oriented with dark square in bottom-left corner

### Starting Position

```
  a b c d e f g h
8 . b . b . b . b
7 b . b . b . b .
6 . b . b . b . b
5 . . . . . . . .
4 . . . . . . . .
3 r . r . r . r .
2 . r . r . r . r
1 r . r . r . r .
```

(r = red/white, b = black, . = empty)

## Basic Movement

### Regular Pieces (Men)

- Move diagonally forward only
- One square per move
- Cannot move backward
- Must move to empty square

### Kings

- Pieces become kings upon reaching opposite end
- Kings can move diagonally forward or backward
- Still limited to one square per non-capturing move

## Capturing Rules

### Mandatory Capture

- If capture is available, player MUST capture
- Cannot choose non-capturing move when capture exists
- Must capture maximum number of pieces possible

### Jump Mechanics

- Jump diagonally over adjacent opponent piece
- Land on empty square immediately beyond
- Captured piece removed from board
- Multiple jumps required if available

### Multiple Jumps

- After capture, if another capture available from landing square
- Must continue jumping in same turn
- Can change direction during multiple jumps
- Turn ends when no more captures possible

### King Captures

- Kings can capture forward or backward
- Same jumping rules as regular pieces
- Can change direction during multiple captures

## Special Rules

### Promotion to King

- When regular piece reaches opposite end row
- Immediately becomes king
- If reached by capture, can continue capturing as king
- Marked by stacking another piece on top (or flipping)

### Forced Captures

- Must capture if possible (no choice)
- If multiple captures available:
  - Must choose path capturing most pieces
  - If equal, may choose either path
- Applies to both regular pieces and kings

### Flying Kings (International Draughts)

- Not used in American Checkers
- Kings can move multiple squares
- Can capture at distance

## Winning Conditions

### Victory

1. **Capture All**: Opponent has no pieces remaining
2. **Block All Moves**: Opponent cannot make legal move
3. **Resignation**: Opponent concedes defeat

### Draw Conditions

1. **Agreement**: Both players agree to draw
2. **Repetition**: Same position repeated 3 times
3. **40-Move Rule**: 40 moves without capture or promotion
4. **Insufficient Material**: Neither player can force win

## Strategy Tips for AI

### Opening Principles

- Control center squares (especially d4 and e5)
- Maintain back row as long as possible
- Develop pieces toward center
- Avoid early exchanges unless advantageous

### Middle Game

- **Piece Coordination**: Keep pieces supporting each other
- **King Development**: Safely advance pieces for promotion
- **Forced Sequences**: Look for forcing capture combinations
- **Tempo**: Make moves that force opponent responses

### Tactical Patterns

- **Pin**: Piece cannot move without exposing another
- **Fork**: Threaten multiple pieces simultaneously
- **Sacrifice**: Give up piece for positional advantage
- **Bridge**: Control key diagonal with piece chain

### King vs Regular Pieces

- King worth approximately 1.5 regular pieces
- Two kings usually beat three regular pieces
- King mobility crucial in endgame

### Endgame Principles

- **Opposition**: Control key squares
- **Triangulation**: Maneuver to gain tempo
- **King Centralization**: Kings more powerful in center
- **Piece Advantage**: Push material advantage

### Common Endgames

- **2 Kings vs 1 King**: Win by trapping in corner/edge
- **King vs 2 Pieces**: Usually draw with correct defense
- **King + Piece vs King**: Win by promotion or trap

## Position Evaluation for AI

### Material Count

- Regular piece = 1 point
- King = 1.5-1.7 points
- Adjust for position quality

### Positional Factors

- **Center Control**: Bonus for center squares
- **King Row**: Bonus for maintaining back row
- **Mobility**: More moves = better position
- **Advanced Pieces**: Closer to promotion = higher value

### Strategic Elements

- **Piece Safety**: Protected pieces worth more
- **King Position**: Central kings more valuable
- **Tempo**: Initiative has value
- **Structure**: Connected pieces stronger

## API Move Format

For regular moves:

```json
{
  "player": "red",
  "action": "move",
  "from": {
    "row": 2,
    "col": 1
  },
  "to": {
    "row": 3,
    "col": 2
  }
}
```

For captures (including multiple jumps):

```json
{
  "player": "red",
  "action": "capture",
  "path": [
    { "row": 2, "col": 1 },
    { "row": 4, "col": 3 },
    { "row": 6, "col": 5 }
  ],
  "captured": [
    { "row": 3, "col": 2 },
    { "row": 5, "col": 4 }
  ]
}
```

## Notation Systems

### Numeric Notation

Dark squares numbered 1-32:

```
  29 30 31 32
25 26 27 28
  21 22 23 24
17 18 19 20
  13 14 15 16
 9 10 11 12
   5  6  7  8
 1  2  3  4
```

### Algebraic Notation

- Squares: a1-h8 (only dark squares used)
- Moves: e3-d4 (non-capturing) or e3xg5 (capturing)

## Game State Tracking

- Current board position
- Whose turn
- Pieces and kings for each player
- Available moves (especially forced captures)
- Move history
- Repetition count for draw detection
- Moves since last capture/promotion
