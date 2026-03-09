import { ChessGame } from '@llmletsplay/versus-chess';

const game = new ChessGame('example-chess');
await game.initializeGame();

const move = {
  player: 'white',
  from: { row: 6, col: 4 },
  to: { row: 4, col: 4 },
};

const validation = await game.validateMove(move);
if (!validation.valid) {
  throw new Error(validation.error ?? 'Move was rejected');
}

const state = await game.makeMove(move);

console.log(
  JSON.stringify(
    {
      currentPlayer: state.currentPlayer,
      movedPiece: state.board[4][4],
      halfmoveClock: state.halfmoveClock,
    },
    null,
    2
  )
);
