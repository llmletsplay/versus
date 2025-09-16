# Chess Rules

## Overview
Chess is a strategic board game played between two players on an 8×8 checkered board with 64 squares. Each player begins with 16 pieces: one king, one queen, two rooks, two bishops, two knights, and eight pawns.

## Objective
The objective is to checkmate the opponent's king by placing it under attack ("check") with no legal moves to escape.

## Initial Setup
- Board is positioned with a light square in the bottom-right corner from each player's perspective
- White pieces start on ranks 1 and 2, black pieces on ranks 7 and 8
- Queens start on their own color (white queen on light square, black queen on dark square)
- Kings start beside their queens

## Piece Movement

### King
- Moves one square in any direction (horizontal, vertical, or diagonal)
- Cannot move into check
- Special move: Castling (see below)

### Queen
- Moves any number of squares in any direction (horizontal, vertical, or diagonal)
- Cannot jump over other pieces

### Rook
- Moves any number of squares horizontally or vertically
- Cannot jump over other pieces
- Used in castling

### Bishop
- Moves any number of squares diagonally
- Cannot jump over other pieces
- Each player starts with one bishop on light squares and one on dark squares

### Knight
- Moves in an "L" shape: two squares in one direction, then one square perpendicular
- Only piece that can jump over other pieces

### Pawn
- Moves forward one square, or two squares on its first move
- Captures diagonally forward one square
- Special moves: En passant capture, promotion (see below)

## Special Rules

### Castling
- King and rook move simultaneously
- Requirements:
  - Neither king nor rook has moved
  - No pieces between king and rook
  - King is not in check
  - King doesn't pass through or land on a square attacked by enemy
- Kingside: King moves 2 squares toward rook, rook moves to square king crossed
- Queenside: King moves 2 squares toward rook, rook moves to square king crossed

### En Passant
- When opponent's pawn moves two squares from starting position, landing beside your pawn
- You can capture "in passing" on the immediately following turn
- Move your pawn diagonally to the square the opponent's pawn passed through
- Opponent's pawn is removed from the board

### Pawn Promotion
- When pawn reaches the opposite end of the board (8th rank for white, 1st rank for black)
- Must be promoted to queen, rook, bishop, or knight (player's choice)
- Usually promoted to queen (most powerful piece)

## Check and Checkmate

### Check
- King is under attack and must be resolved immediately
- Three ways to resolve check:
  1. Move the king to safety
  2. Block the attack with another piece
  3. Capture the attacking piece

### Checkmate
- King is in check with no legal moves to escape
- Game ends immediately with checkmate

### Stalemate
- Player has no legal moves but king is not in check
- Game ends in a draw

## Game End Conditions

### Win
- Checkmate opponent's king
- Opponent resigns

### Draw
- Stalemate
- Mutual agreement
- Threefold repetition of position
- 50-move rule (50 moves without pawn move or capture)
- Insufficient material to checkmate

## Move Notation
- Algebraic notation is used
- Format: [Piece][destination square]
- Examples: e4 (pawn to e4), Nf3 (knight to f3), Qh5 (queen to h5)
- Special symbols: + (check), # (checkmate), 0-0 (kingside castling), 0-0-0 (queenside castling)

## Strategy Tips for AI
- Control the center squares (e4, e5, d4, d5)
- Develop pieces toward the center
- Castle early for king safety
- Don't move same piece twice in opening
- Look for tactics: pins, forks, skewers, discovered attacks
- In endgame, activate the king