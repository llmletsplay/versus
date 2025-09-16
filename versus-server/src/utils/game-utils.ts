/**
 * Shared game utilities for common game patterns
 */

/**
 * Generates player IDs for a game
 * @param count - Number of players
 * @returns Array of player IDs
 */
export function generatePlayerIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `player${i + 1}`);
}

/**
 * Gets the next player in turn order
 * @param playerOrder - Array of player IDs in order
 * @param currentPlayer - Current player ID
 * @param skipCondition - Optional function to skip players (e.g., folded players)
 * @returns Next player ID
 */
export function getNextPlayer(
  playerOrder: string[],
  currentPlayer: string,
  skipCondition?: (_playerId: string) => boolean
): string {
  const currentIndex = playerOrder.indexOf(currentPlayer);
  if (currentIndex === -1) {
    return playerOrder[0]!; // Fallback to first player
  }

  let nextIndex = (currentIndex + 1) % playerOrder.length;
  let attempts = 0;

  while (attempts < playerOrder.length) {
    const nextPlayer = playerOrder[nextIndex]!;

    if (!skipCondition || !skipCondition(nextPlayer)) {
      return nextPlayer;
    }

    nextIndex = (nextIndex + 1) % playerOrder.length;
    attempts++;
  }

  return currentPlayer; // Fallback if no valid next player
}

/**
 * Gets the previous player in turn order
 * @param playerOrder - Array of player IDs in order
 * @param currentPlayer - Current player ID
 * @param skipCondition - Optional function to skip players
 * @returns Previous player ID
 */
export function getPreviousPlayer(
  playerOrder: string[],
  currentPlayer: string,
  skipCondition?: (_playerId: string) => boolean
): string {
  const currentIndex = playerOrder.indexOf(currentPlayer);
  if (currentIndex === -1) {
    return playerOrder[playerOrder.length - 1]!; // Fallback to last player
  }

  let prevIndex = currentIndex === 0 ? playerOrder.length - 1 : currentIndex - 1;
  let attempts = 0;

  while (attempts < playerOrder.length) {
    const prevPlayer = playerOrder[prevIndex]!;

    if (!skipCondition || !skipCondition(prevPlayer)) {
      return prevPlayer;
    }

    prevIndex = prevIndex === 0 ? playerOrder.length - 1 : prevIndex - 1;
    attempts++;
  }

  return currentPlayer; // Fallback if no valid previous player
}

/**
 * Counts active players based on a condition
 * @param playerOrder - Array of player IDs
 * @param isActiveCondition - Function to determine if player is active
 * @returns Number of active players
 */
export function countActivePlayers(
  playerOrder: string[],
  isActiveCondition: (_playerId: string) => boolean
): number {
  return playerOrder.filter(isActiveCondition).length;
}

/**
 * Gets all active players based on a condition
 * @param playerOrder - Array of player IDs
 * @param isActiveCondition - Function to determine if player is active
 * @returns Array of active player IDs
 */
export function getActivePlayers(
  playerOrder: string[],
  isActiveCondition: (_playerId: string) => boolean
): string[] {
  return playerOrder.filter(isActiveCondition);
}

/**
 * Validates that a player exists and is the current player
 * @param playerId - Player ID to validate
 * @param currentPlayer - Current player ID
 * @param validPlayers - Array of valid player IDs
 * @returns Validation result
 */
export function validatePlayerTurn(
  playerId: string,
  currentPlayer: string,
  validPlayers: string[]
): { valid: boolean; error?: string } {
  if (!playerId) {
    return { valid: false, error: 'Player ID is required' };
  }

  if (!validPlayers.includes(playerId)) {
    return { valid: false, error: 'Invalid player' };
  }

  if (playerId !== currentPlayer) {
    return { valid: false, error: 'Not your turn' };
  }

  return { valid: true };
}

/**
 * Validates coordinate bounds for grid-based games
 * @param row - Row coordinate
 * @param col - Column coordinate
 * @param maxRow - Maximum row (exclusive)
 * @param maxCol - Maximum column (exclusive)
 * @returns Validation result
 */
export function validateCoordinates(
  row: number,
  col: number,
  maxRow: number,
  maxCol: number
): { valid: boolean; error?: string } {
  if (typeof row !== 'number' || typeof col !== 'number') {
    return { valid: false, error: 'Coordinates must be numbers' };
  }

  if (!Number.isInteger(row) || !Number.isInteger(col)) {
    return { valid: false, error: 'Coordinates must be integers' };
  }

  if (row < 0 || row >= maxRow || col < 0 || col >= maxCol) {
    return {
      valid: false,
      error: `Coordinates must be within bounds (0-${maxRow - 1}, 0-${maxCol - 1})`,
    };
  }

  return { valid: true };
}

/**
 * Checks if a position is within grid bounds
 * @param row - Row coordinate
 * @param col - Column coordinate
 * @param maxRow - Maximum row (exclusive)
 * @param maxCol - Maximum column (exclusive)
 * @returns True if within bounds
 */
export function isWithinBounds(row: number, col: number, maxRow: number, maxCol: number): boolean {
  return row >= 0 && row < maxRow && col >= 0 && col < maxCol;
}

/**
 * Creates an empty grid filled with a default value
 * @param rows - Number of rows
 * @param cols - Number of columns
 * @param defaultValue - Value to fill grid with
 * @returns 2D array grid
 */
export function createGrid<T>(rows: number, cols: number, defaultValue: T): T[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => defaultValue));
}

/**
 * Deep clones a 2D grid
 * @param grid - Grid to clone
 * @returns Cloned grid
 */
export function cloneGrid<T>(grid: T[][]): T[][] {
  return grid.map(row => [...row]);
}

/**
 * Finds all positions in a grid matching a condition
 * @param grid - Grid to search
 * @param predicate - Function to test each cell
 * @returns Array of positions
 */
export function findPositions<T>(
  grid: T[][],
  predicate: (_value: T, _row: number, _col: number) => boolean
): Array<{ row: number; col: number }> {
  const positions: Array<{ row: number; col: number }> = [];

  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row]!.length; col++) {
      if (predicate(grid[row]![col]!, row, col)) {
        positions.push({ row, col });
      }
    }
  }

  return positions;
}

/**
 * Checks for a line of consecutive values in a grid
 * @param grid - Grid to check
 * @param startRow - Starting row
 * @param startCol - Starting column
 * @param deltaRow - Row direction (-1, 0, 1)
 * @param deltaCol - Column direction (-1, 0, 1)
 * @param length - Required length of line
 * @param value - Value to look for
 * @returns True if line found
 */
export function checkLine<T>(
  grid: T[][],
  startRow: number,
  startCol: number,
  deltaRow: number,
  deltaCol: number,
  length: number,
  value: T
): boolean {
  for (let i = 0; i < length; i++) {
    const row = startRow + i * deltaRow;
    const col = startCol + i * deltaCol;

    if (!isWithinBounds(row, col, grid.length, grid[0]?.length || 0)) {
      return false;
    }

    if (grid[row]![col] !== value) {
      return false;
    }
  }

  return true;
}

/**
 * Finds all lines of consecutive values in a grid
 * @param grid - Grid to check
 * @param length - Required length of line
 * @param value - Value to look for
 * @returns Array of line start positions and directions
 */
export function findLines<T>(
  grid: T[][],
  length: number,
  value: T
): Array<{ startRow: number; startCol: number; deltaRow: number; deltaCol: number }> {
  const lines: Array<{ startRow: number; startCol: number; deltaRow: number; deltaCol: number }> =
    [];
  const directions = [
    { deltaRow: 0, deltaCol: 1 }, // Horizontal
    { deltaRow: 1, deltaCol: 0 }, // Vertical
    { deltaRow: 1, deltaCol: 1 }, // Diagonal
    { deltaRow: 1, deltaCol: -1 }, // Anti-diagonal
  ];

  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < (grid[row]?.length || 0); col++) {
      for (const { deltaRow, deltaCol } of directions) {
        if (checkLine(grid, row, col, deltaRow, deltaCol, length, value)) {
          lines.push({ startRow: row, startCol: col, deltaRow, deltaCol });
        }
      }
    }
  }

  return lines;
}

/**
 * Calculates Manhattan distance between two points
 * @param row1 - First point row
 * @param col1 - First point column
 * @param row2 - Second point row
 * @param col2 - Second point column
 * @returns Manhattan distance
 */
export function manhattanDistance(row1: number, col1: number, row2: number, col2: number): number {
  return Math.abs(row1 - row2) + Math.abs(col1 - col2);
}

/**
 * Calculates Chebyshev distance (max of row/col differences) between two points
 * @param row1 - First point row
 * @param col1 - First point column
 * @param row2 - Second point row
 * @param col2 - Second point column
 * @returns Chebyshev distance
 */
export function chebyshevDistance(row1: number, col1: number, row2: number, col2: number): number {
  return Math.max(Math.abs(row1 - row2), Math.abs(col1 - col2));
}

/**
 * Gets all adjacent positions (4-directional)
 * @param row - Center row
 * @param col - Center column
 * @param maxRow - Maximum row (exclusive)
 * @param maxCol - Maximum column (exclusive)
 * @returns Array of adjacent positions
 */
export function getAdjacentPositions(
  row: number,
  col: number,
  maxRow: number,
  maxCol: number
): Array<{ row: number; col: number }> {
  const positions: Array<{ row: number; col: number }> = [];
  const directions = [
    { deltaRow: -1, deltaCol: 0 }, // Up
    { deltaRow: 1, deltaCol: 0 }, // Down
    { deltaRow: 0, deltaCol: -1 }, // Left
    { deltaRow: 0, deltaCol: 1 }, // Right
  ];

  for (const { deltaRow, deltaCol } of directions) {
    const newRow = row + deltaRow;
    const newCol = col + deltaCol;

    if (isWithinBounds(newRow, newCol, maxRow, maxCol)) {
      positions.push({ row: newRow, col: newCol });
    }
  }

  return positions;
}

/**
 * Gets all diagonal positions
 * @param row - Center row
 * @param col - Center column
 * @param maxRow - Maximum row (exclusive)
 * @param maxCol - Maximum column (exclusive)
 * @returns Array of diagonal positions
 */
export function getDiagonalPositions(
  row: number,
  col: number,
  maxRow: number,
  maxCol: number
): Array<{ row: number; col: number }> {
  const positions: Array<{ row: number; col: number }> = [];
  const directions = [
    { deltaRow: -1, deltaCol: -1 }, // Up-left
    { deltaRow: -1, deltaCol: 1 }, // Up-right
    { deltaRow: 1, deltaCol: -1 }, // Down-left
    { deltaRow: 1, deltaCol: 1 }, // Down-right
  ];

  for (const { deltaRow, deltaCol } of directions) {
    const newRow = row + deltaRow;
    const newCol = col + deltaCol;

    if (isWithinBounds(newRow, newCol, maxRow, maxCol)) {
      positions.push({ row: newRow, col: newCol });
    }
  }

  return positions;
}

/**
 * Gets all surrounding positions (8-directional)
 * @param row - Center row
 * @param col - Center column
 * @param maxRow - Maximum row (exclusive)
 * @param maxCol - Maximum column (exclusive)
 * @returns Array of surrounding positions
 */
export function getSurroundingPositions(
  row: number,
  col: number,
  maxRow: number,
  maxCol: number
): Array<{ row: number; col: number }> {
  return [
    ...getAdjacentPositions(row, col, maxRow, maxCol),
    ...getDiagonalPositions(row, col, maxRow, maxCol),
  ];
}
