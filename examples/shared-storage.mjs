import { ChessGame } from '@versus/chess';
import { InMemoryDatabaseProvider } from '@versus/game-core';

const storage = new InMemoryDatabaseProvider();
await storage.initialize();

const original = new ChessGame('shared-storage-demo', storage);
await original.initializeGame();
await original.makeMove({
  player: 'white',
  from: { row: 6, col: 4 },
  to: { row: 4, col: 4 },
});

const savedState = await storage.getGameState('shared-storage-demo');
if (!savedState) {
  throw new Error('Saved state was not found');
}

const restored = new ChessGame('shared-storage-demo', storage);
await restored.restoreFromDatabase(savedState);
const state = await restored.getGameState();

console.log(
  JSON.stringify(
    {
      currentPlayer: state.currentPlayer,
      pieceAtE4: state.board[4][4],
      movesPersisted: restored.getHistory().length,
    },
    null,
    2
  )
);

await storage.close();
