import { GameManager } from '../core/game-manager.js';
import { TicTacToeGame } from './tic-tac-toe.js';
import { ConnectFourGame } from './connect-four.js';
import { ChessGame } from './chess.js';
import { CheckersGame } from './checkers.js';
import { OmokGame } from './omok.js';
import { BattleshipGame } from './battleship.js';
import { BlackjackGame } from './blackjack.js';
import { OthelloGame } from './othello.js';
import { MancalaGame } from './mancala.js';
import { ThirteenGame } from './thirteen.js';
import { GoFishGame } from './go-fish.js';
import { CuttleGame } from './cuttle.js';
import { WarGame } from './war.js';
import { BullshitGame } from './bullshit.js';
import { PokerGame } from './poker.js';
import { WordTilesGame } from './word-tiles.js';
import { CrazyCardsGame } from './crazy-cards.js';
import { CatanGame } from './catan.js';
// New games
import { GoGame } from './go.js';
import { AgainstCardsGame } from './against-cards.js';
import { BingoGame } from './bingo.js';
import { HeartsGame } from './hearts.js';
import { SpadesGame } from './spades.js';
import { MahjongGame } from './mahjong.js';
import { ChineseCheckersGame } from './chinese-checkers.js';
import { MartialTacticsGame } from './martial-tactics.js';
import { ShogiGame } from './shogi.js';

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
