import { GameManager } from '../core/game-manager.js';
import { TicTacToeGame } from '@llmletsplay/versus-tic-tac-toe';
import { ConnectFourGame } from '@llmletsplay/versus-connect-four';
import { ChessGame } from '@llmletsplay/versus-chess';
import { CheckersGame } from '@llmletsplay/versus-checkers';
import { OmokGame } from '@llmletsplay/versus-omok';
import { BattleshipGame } from '@llmletsplay/versus-battleship';
import { BlackjackGame } from '@llmletsplay/versus-blackjack';
import { OthelloGame } from '@llmletsplay/versus-othello';
import { MancalaGame } from '@llmletsplay/versus-mancala';
import { ThirteenGame } from '@llmletsplay/versus-thirteen';
import { GoFishGame } from '@llmletsplay/versus-go-fish';
import { CuttleGame } from '@llmletsplay/versus-cuttle';
import { WarGame } from '@llmletsplay/versus-war';
import { BullshitGame } from '@llmletsplay/versus-bullshit';
import { PokerGame } from '@llmletsplay/versus-poker';
import { WordTilesGame } from '@llmletsplay/versus-word-tiles';
import { CrazyCardsGame } from '@llmletsplay/versus-crazy-cards';
import { CatanGame } from '@llmletsplay/versus-catan';
// New games
import { GoGame } from '@llmletsplay/versus-go';
import { BingoGame } from '@llmletsplay/versus-bingo';
import { HeartsGame } from '@llmletsplay/versus-hearts';
import { SpadesGame } from '@llmletsplay/versus-spades';
import { MahjongGame } from '@llmletsplay/versus-mahjong';
import { ChineseCheckersGame } from '@llmletsplay/versus-chinese-checkers';
import { MartialTacticsGame } from '@llmletsplay/versus-martial-tactics';
import { ShogiGame } from '@llmletsplay/versus-shogi';

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
  gameManager.registerGame('go', GoGame);  gameManager.registerGame('bingo', BingoGame);
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
  GoGame,  BingoGame,
  HeartsGame,
  SpadesGame,
  MahjongGame,
  ChineseCheckersGame,
  MartialTacticsGame,
  ShogiGame,
};
