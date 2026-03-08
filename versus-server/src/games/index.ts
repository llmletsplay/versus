import { GameManager } from '../core/game-manager.js';
import { TicTacToeGame } from '@versus/tic-tac-toe';
import { ConnectFourGame } from '@versus/connect-four';
import { ChessGame } from '@versus/chess';
import { CheckersGame } from '@versus/checkers';
import { OmokGame } from '@versus/omok';
import { BattleshipGame } from '@versus/battleship';
import { BlackjackGame } from '@versus/blackjack';
import { OthelloGame } from '@versus/othello';
import { MancalaGame } from '@versus/mancala';
import { ThirteenGame } from '@versus/thirteen';
import { GoFishGame } from '@versus/go-fish';
import { CuttleGame } from '@versus/cuttle';
import { WarGame } from '@versus/war';
import { BullshitGame } from '@versus/bullshit';
import { PokerGame } from '@versus/poker';
import { WordTilesGame } from '@versus/word-tiles';
import { CrazyCardsGame } from '@versus/crazy-cards';
import { CatanGame } from '@versus/catan';
// New games
import { GoGame } from '@versus/go';
import { AgainstCardsGame } from '@versus/against-cards';
import { BingoGame } from '@versus/bingo';
import { HeartsGame } from '@versus/hearts';
import { SpadesGame } from '@versus/spades';
import { MahjongGame } from '@versus/mahjong';
import { ChineseCheckersGame } from '@versus/chinese-checkers';
import { MartialTacticsGame } from '@versus/martial-tactics';
import { ShogiGame } from '@versus/shogi';

export function registerGames(gameManager: GameManager): void {
  // Register all available games
  gameManager.registerGame('tic-tac-toe', TicTacToeGame);
  gameManager.registerGame('connect-four', ConnectFourGame);
  gameManager.registerGame('chess', ChessGame);
  gameManager.registerGame('checkers', CheckersGame);
  gameManager.registerGame('omok', OmokGame);
  gameManager.registerGame('battleship', BattleshipGame);
  gameManager.registerGame('blackjack', BlackjackGame);
  gameManager.registerGame('othello', OthelloGame);
  gameManager.registerGame('mancala', MancalaGame);
  gameManager.registerGame('thirteen', ThirteenGame);
  gameManager.registerGame('go-fish', GoFishGame);
  gameManager.registerGame('cuttle', CuttleGame);
  gameManager.registerGame('war', WarGame);
  gameManager.registerGame('bullshit', BullshitGame);
  gameManager.registerGame('poker', PokerGame);
  gameManager.registerGame('word-tiles', WordTilesGame);
  gameManager.registerGame('crazy-cards', CrazyCardsGame);
  gameManager.registerGame('catan', CatanGame);

  // New games
  gameManager.registerGame('go', GoGame);
  gameManager.registerGame('against-cards', AgainstCardsGame);
  gameManager.registerGame('bingo', BingoGame);
  gameManager.registerGame('hearts', HeartsGame);
  gameManager.registerGame('spades', SpadesGame);
  gameManager.registerGame('mahjong', MahjongGame);
  gameManager.registerGame('chinese-checkers', ChineseCheckersGame);
  gameManager.registerGame('martial-tactics', MartialTacticsGame);
  gameManager.registerGame('shogi', ShogiGame);
}

// Export game classes for direct use if needed
export {
  TicTacToeGame,
  ConnectFourGame,
  ChessGame,
  CheckersGame,
  OmokGame,
  BattleshipGame,
  BlackjackGame,
  OthelloGame,
  MancalaGame,
  ThirteenGame,
  GoFishGame,
  CuttleGame,
  WarGame,
  BullshitGame,
  PokerGame,
  WordTilesGame,
  CrazyCardsGame,
  CatanGame,
  // New games
  GoGame,
  AgainstCardsGame,
  BingoGame,
  HeartsGame,
  SpadesGame,
  MahjongGame,
  ChineseCheckersGame,
  MartialTacticsGame,
  ShogiGame,
};
