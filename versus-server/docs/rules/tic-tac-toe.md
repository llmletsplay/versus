# Tic-Tac-Toe Rules

## Overview
Tic-Tac-Toe is a simple strategy game played on a 3×3 grid between two players, typically using X and O symbols.

## Objective
Be the first player to get three of your marks in a row (horizontally, vertically, or diagonally).

## Setup
- Empty 3×3 grid with 9 squares
- Player 1 uses "X", Player 2 uses "O"
- Players alternate turns, with X going first

## Gameplay

### Turn Structure
1. Current player chooses an empty square
2. Place their mark (X or O) in the chosen square
3. Check for win condition
4. If no win, switch to other player

### Valid Moves
- Can only place mark in empty squares
- Cannot overwrite existing marks
- Must place exactly one mark per turn

## Winning Conditions

### Win
Three marks in a row:
- **Horizontal**: Top row (1,2,3), Middle row (4,5,6), Bottom row (7,8,9)
- **Vertical**: Left column (1,4,7), Middle column (2,5,8), Right column (3,6,9)  
- **Diagonal**: Top-left to bottom-right (1,5,9), Top-right to bottom-left (3,5,7)

### Draw
- All 9 squares are filled with no winner
- Game ends in a tie

## Board Positions
```
1 | 2 | 3
---------
4 | 5 | 6
---------
7 | 8 | 9
```

## Strategy Tips for AI
- **Center Control**: Position 5 is most valuable (can win in 4 different lines)
- **Corner Strategy**: Corners (1,3,7,9) are strong positions
- **Blocking**: Always block opponent's immediate winning move
- **Fork Creation**: Try to create multiple winning threats simultaneously
- **Opening**: If going first, center or corner are optimal opening moves
- **Response**: If opponent takes center, take a corner; if opponent takes corner, take center

## Example Game Flow
1. X places in center (position 5): `_ _ _ | _ X _ | _ _ _`
2. O places in corner (position 1): `O _ _ | _ X _ | _ _ _`
3. X places in corner (position 9): `O _ _ | _ X _ | _ _ X`
4. O must block (position 2): `O O _ | _ X _ | _ _ X`
5. X blocks O's threat (position 3): `O O X | _ X _ | _ _ X`
6. Continue until win or draw

## API Move Format
```json
{
  "player": "X",
  "position": 5
}
```

Position numbers correspond to the grid positions (1-9) as shown above.