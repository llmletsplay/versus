import { MahjongGame } from '@versus/mahjong';

const game = new MahjongGame('mahjong-demo');
await game.initializeGame();
const state = await game.getGameState();

console.log(
  JSON.stringify(
    {
      currentPlayer: state.currentPlayer,
      dealer: state.dealer,
      prevalentWind: state.prevalentWind,
      seatWinds: state.seatWinds,
      sessionScores: state.sessionScores,
      dealerHandSize: state.hands.player1.tileCount,
      liveWallTiles: state.liveWallSize,
    },
    null,
    2
  )
);
