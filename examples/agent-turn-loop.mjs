import { OmokGame } from '@llmletsplay/versus-omok';

const game = new OmokGame('agent-loop');
await game.initializeGame();

async function requestAgentMove(gameState) {
  // Replace this with your actual model/tool call.
  const candidateMoves = [
    { row: 7, col: 8 },
    { row: 8, col: 7 },
    { row: 8, col: 8 },
    { row: 6, col: 7 },
  ];

  for (const candidate of candidateMoves) {
    const validation = await game.validateMove({
      ...candidate,
      player: 'white',
    });

    if (validation.valid) {
      return {
        ...candidate,
        player: 'white',
      };
    }
  }

  throw new Error(`No valid reply for player ${gameState.currentPlayer}`);
}

async function playTurn(row, col) {
  const userMove = {
    row,
    col,
    player: 'black',
  };

  const userValidation = await game.validateMove(userMove);
  if (!userValidation.valid) {
    throw new Error(userValidation.error ?? 'User move rejected');
  }

  const afterUserMove = await game.makeMove(userMove);
  if (afterUserMove.gameOver) {
    return afterUserMove;
  }

  const agentMove = await requestAgentMove(afterUserMove);
  const agentValidation = await game.validateMove(agentMove);
  if (!agentValidation.valid) {
    throw new Error(agentValidation.error ?? 'Agent move rejected');
  }

  return game.makeMove(agentMove);
}

const afterTurn = await playTurn(7, 7);

console.log(
  JSON.stringify(
    {
      currentPlayer: afterTurn.currentPlayer,
      winner: afterTurn.winner,
      center: afterTurn.board.slice(6, 9).map(row => row.slice(6, 9)),
    },
    null,
    2
  )
);
