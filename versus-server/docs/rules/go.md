# Go Rules

## Overview

Go is an ancient strategy board game originating from China over 4,000 years ago. Two players alternately place stones on a grid, attempting to control territory and capture opponent stones.

## Objective

Control more territory (empty points) than your opponent by surrounding areas with your stones. The player with the most territory plus captured stones wins.

## Setup

- Standard board sizes: 19×19, 13×13, or 9×9
- Black and white stones (black plays first)
- Empty board at start
- Handicap stones possible for skill differences

## Basic Rules

### Stone Placement

- Players alternate placing one stone on empty intersections
- Once placed, stones don't move (only removed if captured)
- Black plays first (compensation given to white via komi)

### Liberties

- Empty points adjacent to a stone or group
- Stones need at least one liberty to remain on board
- Diagonal points are not liberties

### Capture

- Stone/group with zero liberties is captured
- Removed from board immediately
- Captured stones count as prisoner points

### Groups

- Adjacent stones of same color form groups
- Groups share liberties
- Entire group captured if all liberties filled

## Core Concepts

### Life and Death

- **Two Eyes**: Group with two separate internal liberties cannot be captured
- **Dead Group**: Group that cannot avoid capture
- **Seki**: Mutual life - neither player can capture without losing their own group

### Ko Rule

- Board position cannot immediately repeat
- Prevents infinite capture loops
- Player must play elsewhere before recapturing

### Territory

- Empty points surrounded by one color
- Counted at game end
- Neutral points (dame) worth zero

## Scoring Systems

### Territory Scoring (Japanese Rules)

- Territory + Prisoners
- Komi: 6.5 points to white (compensation for going second)
- Remove dead stones by agreement

### Area Scoring (Chinese Rules)

- Territory + Stones on board
- Komi: 7.5 points to white
- Mathematically equivalent in most cases

## Game End

### Passing

- Either player may pass instead of playing
- Two consecutive passes end the game
- Players agree on dead stones
- Count territory and add prisoners/komi

### Resignation

- Player may resign when position is hopeless
- Common in professional play

## Strategy Tips for AI

### Opening (Fuseki)

- Corners first (easiest to secure)
- Sides second (harder to secure)
- Center last (hardest to secure)
- Common patterns: 3-4 point, 4-4 point (star point), 3-3 point

### Basic Principles

- **Connection**: Keep groups connected for strength
- **Eye Space**: Ensure groups can make two eyes
- **Efficiency**: Make stones work together
- **Balance**: Balance territory, influence, and attack/defense

### Tactical Concepts

- **Atari**: Threatening immediate capture (one liberty left)
- **Ladder**: Sequential atari pattern
- **Net**: Surrounding pattern preventing escape
- **Snapback**: Sacrifice for immediate recapture

### Strategic Concepts

- **Influence**: Outward-facing strength controlling center
- **Territory**: Secured points (usually corners/sides)
- **Thickness**: Strong walls facing center
- **Aji**: Latent potential in positions

### Life and Death

- **Eye Shape**: Learn basic eye shapes
- **Vital Points**: Key points for making/preventing eyes
- **False Eyes**: Points that look like eyes but aren't
- **Kill/Save**: Practice life and death problems

### Advanced Concepts

- **Sente/Gote**: Initiative (forcing moves vs following)
- **Miai**: Two equivalent options
- **Kikashi**: Forcing moves for later benefit
- **Sabaki**: Light, flexible play in opponent's area

## Special Situations

### Seki (Mutual Life)

- Neither player can capture without loss
- Groups remain on board
- Interior points not counted as territory

### Bent Four in Corner

- Special dead shape in corner
- Dead under Japanese rules
- Requires careful reading

### Triple Ko

- Extremely rare repeating position
- Can lead to void game in some rulesets

## Common Patterns

### Basic Shapes

- **Empty Triangle**: Inefficient shape (usually bad)
- **Tiger's Mouth**: Strong connection pattern
- **Bamboo Joint**: Flexible connection
- **Dog's Face**: Inefficient shape

### Eye Shapes

- **Straight Three**: Alive
- **Bent Three**: Alive
- **Straight Four**: Alive
- **Bent Four**: Dead in corner, alive elsewhere
- **Pyramid Four**: Dead

## API Move Format

For placing a stone:

```json
{
  "player": "black",
  "action": "place",
  "position": {
    "x": 3,
    "y": 3
  }
}
```

For passing:

```json
{
  "player": "black",
  "action": "pass"
}
```

For resignation:

```json
{
  "player": "black",
  "action": "resign"
}
```

## Game State Tracking

- Current board position
- Whose turn (black/white)
- Captured stones count
- Ko position (if any)
- Move history
- Time remaining (if using time control)
- Territory estimates

## Coordinate System

- Letters (A-T, skipping I) for columns
- Numbers (1-19) for rows
- Example: "D4" = 4th column, 4th row
- Alternative: numeric (0-18) for both axes
