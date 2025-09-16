# Architecture Migration Guide

## Overview

The architecture improvements have been implemented in the base classes:

### ✅ Completed Improvements

1. **Generic State Typing** - `AbstractGame<TState>` and `BaseGame<TState>` now support type-safe state management
2. **Undo/Redo Functionality** - Full implementation with state snapshots and API endpoints
3. **makeMove vs applyMove Clarification** - Clear separation where games implement `applyMove()` only
4. **Standardized Player Management** - `PlayerManager` utility for consistent player handling
5. **New API Endpoints** - Undo/redo endpoints added to routes

### 🔄 Migration Strategy

Due to the large number of games (27), we'll migrate incrementally:

## Phase 1: Core Infrastructure (✅ COMPLETE)
- [x] Update `AbstractGame` with generic typing
- [x] Update `BaseGame` with enhanced functionality
- [x] Add `PlayerManager` utility
- [x] Add undo/redo API endpoints
- [x] Ensure backward compatibility

## Phase 2: Priority Game Updates (Next)
Focus on games that will benefit most from the new architecture:

### High Priority Games (Start Here)
1. **Tic-Tac-Toe** - Simplest game, good test case
2. **Chess** - Complex game with clear states
3. **Poker** - Card game with complex state management
4. **Connect Four** - Board game with straightforward logic

### Medium Priority Games
5. **Checkers** - Board game with piece movement
6. **Othello** - Board game with state changes
7. **Blackjack** - Card game with scoring
8. **Go Fish** - Multi-player card game

### Lower Priority Games
9. All remaining games can be migrated as needed

## Phase 3: Testing & Validation
- Create tests for untested games using the new architecture
- Validate undo/redo functionality works correctly
- Performance testing with the new state management

## Migration Steps for Each Game

### 1. Update Game Class Declaration
```typescript
// Old:
export class TicTacToeGame extends BaseGame {

// New:
interface TicTacToeState extends GameState {
  board: string[][];
  // ... other game-specific fields
}

export class TicTacToeGame extends BaseGame<TicTacToeState> {
```

### 2. Update State Initialization
```typescript
async initializeGame(_config?: GameConfig): Promise<TicTacToeState> {
  const initialState: TicTacToeState = {
    gameId: this.gameId,
    gameType: this.gameType,
    board: [
      [null, null, null],
      [null, null, null],
      [null, null, null]
    ],
    currentPlayer: 'X',
    gameOver: false,
    winner: null
  };
  
  this.currentState = initialState;
  await this.persistState();
  return initialState;
}
```

### 3. Update getGameState Method
```typescript
async getGameState(): Promise<TicTacToeState> {
  return {
    ...this.currentState,
    gameId: this.gameId,
    gameType: this.gameType
  };
}
```

### 4. Optional: Add Player Management
```typescript
async initializeGame(_config?: GameConfig): Promise<TicTacToeState> {
  // Initialize standard player management
  this.createTwoPlayerSetup('X', 'O');
  
  // ... rest of initialization
}
```

### 5. Optional: Use Enhanced Validation
```typescript
async validateMove(moveData: Record<string, any>): Promise<MoveValidationResult> {
  // Use standardized player validation
  const playerValidation = this.validatePlayerMove(moveData);
  if (!playerValidation.valid) {
    return playerValidation;
  }
  
  // Game-specific validation...
}
```

## Backward Compatibility

The architecture maintains backward compatibility:
- Existing games continue to work without modification
- New features are opt-in through the enhanced base classes
- API endpoints remain unchanged (new endpoints added)

## Testing Strategy

1. **Unit Tests**: Update existing tests to use typed states
2. **Integration Tests**: Test undo/redo functionality
3. **Regression Tests**: Ensure all games still work as before
4. **Performance Tests**: Validate state management performance

## API Enhancements

New endpoints available:
```
POST /v1/games/:gameType/:gameId/undo    - Undo last move
POST /v1/games/:gameType/:gameId/redo    - Redo next move
GET  /v1/games/:gameType/:gameId/undo-status - Check undo/redo availability
```

## Benefits After Migration

1. **Type Safety** - Compile-time validation of game states
2. **Undo/Redo** - Built-in support for move reversal
3. **Consistent Players** - Standardized player management
4. **Better Architecture** - Clear separation of concerns
5. **Easier Testing** - Typed interfaces make testing easier
6. **Enhanced APIs** - More functionality for clients

## Current Status

- **Infrastructure**: ✅ Complete and functional
- **Games Migrated**: 0/27 (migration in progress)
- **Tests Updated**: Pending migration
- **Documentation**: ✅ Complete

## Next Steps

1. Start with Tic-Tac-Toe migration as proof of concept
2. Test thoroughly to validate the approach
3. Continue with Chess and Poker
4. Create automated migration tools if patterns emerge
5. Update tests for migrated games
6. Add tests for the 9 untested games using new architecture

The architecture is production-ready and backward-compatible. Games can be migrated incrementally without breaking existing functionality.