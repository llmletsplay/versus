import { WordTilesGame } from '@versus/word-tiles';

const game = new WordTilesGame(
  'custom-lexicon-demo',
  {
    lexicon: ['HELLO', 'WORLD', 'NODE', 'VERSUS'],
    lexiconName: 'demo-lexicon',
  }
);

await game.initializeGame({ playerCount: 2 });
const state = await game.getGameState();

console.log(
  JSON.stringify(
    {
      currentPlayer: state.currentPlayer,
      lexicon: state.lexicon,
      rackSize: state.players[state.currentPlayer].rackSize,
    },
    null,
    2
  )
);
