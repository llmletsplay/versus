import type { GameStateData } from '@llmletsplay/versus-game-core';

type RestorableGame = {
  getGameId(): string;
  getGameType(): string;
  getGameState(): Promise<Record<string, any>>;
  getHistory(): any[];
  restoreFromDatabase(data: GameStateData): Promise<void>;
};

function inferPlayers(state: Record<string, any>): string[] {
  if (Array.isArray(state.players)) {
    return state.players.map((player) =>
      typeof player === 'string' ? player : player?.id ?? player?.name ?? String(player)
    );
  }

  if (state.players && typeof state.players === 'object') {
    return Object.keys(state.players);
  }

  if (Array.isArray(state.playerOrder)) {
    return [...state.playerOrder];
  }

  if (typeof state.currentPlayer === 'string') {
    return [state.currentPlayer];
  }

  return [];
}

export async function restoreGameState(
  game: RestorableGame,
  stateOverrides: Record<string, any>
): Promise<void> {
  const currentState = (game as any).currentState ?? (await game.getGameState());
  const gameState = { ...currentState, ...stateOverrides };

  await game.restoreFromDatabase({
    gameId: game.getGameId(),
    gameType: game.getGameType(),
    gameState,
    moveHistory: stateOverrides.moveHistory ?? game.getHistory(),
    players: inferPlayers(gameState),
    status: gameState.gameOver ? 'completed' : gameState.status ?? 'active',
  });
}
