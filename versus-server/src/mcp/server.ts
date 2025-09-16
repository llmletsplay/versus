import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { logger } from '../utils/logger.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GameManager } from '../core/game-manager.js';
import { registerGames } from '../games/index.js';

export class VersusGameMCPServer {
  private server: Server;
  private gameManager: GameManager;

  constructor() {
    this.server = new Server(
      {
        name: 'versus-game-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.gameManager = new GameManager('./mcp_game_data');
    registerGames(this.gameManager);

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: 'list_games',
          description: 'List all available game types',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_game_metadata',
          description: 'Get metadata for a specific game type or all games',
          inputSchema: {
            type: 'object',
            properties: {
              gameType: {
                type: 'string',
                description: 'The game type to get metadata for (optional)',
              },
            },
          },
        },
        {
          name: 'create_game',
          description: 'Create a new game instance',
          inputSchema: {
            type: 'object',
            properties: {
              gameType: {
                type: 'string',
                description: 'The type of game to create',
              },
              config: {
                type: 'object',
                description: 'Optional game configuration',
                properties: {
                  maxPlayers: { type: 'number' },
                  minPlayers: { type: 'number' },
                  timeLimit: { type: 'number' },
                  customRules: { type: 'object' },
                },
              },
            },
            required: ['gameType'],
          },
        },
        {
          name: 'make_move',
          description: 'Make a move in a game',
          inputSchema: {
            type: 'object',
            properties: {
              gameType: {
                type: 'string',
                description: 'The type of game',
              },
              gameId: {
                type: 'string',
                description: 'The game ID',
              },
              moveData: {
                type: 'object',
                description: 'The move data (varies by game type)',
              },
            },
            required: ['gameType', 'gameId', 'moveData'],
          },
        },
        {
          name: 'get_game_state',
          description: 'Get the current state of a game',
          inputSchema: {
            type: 'object',
            properties: {
              gameType: {
                type: 'string',
                description: 'The type of game',
              },
              gameId: {
                type: 'string',
                description: 'The game ID',
              },
            },
            required: ['gameType', 'gameId'],
          },
        },
        {
          name: 'get_game_history',
          description: 'Get the move history of a game',
          inputSchema: {
            type: 'object',
            properties: {
              gameType: {
                type: 'string',
                description: 'The type of game',
              },
              gameId: {
                type: 'string',
                description: 'The game ID',
              },
            },
            required: ['gameType', 'gameId'],
          },
        },
        {
          name: 'analyze_game',
          description: 'Analyze the current game state and suggest moves',
          inputSchema: {
            type: 'object',
            properties: {
              gameType: {
                type: 'string',
                description: 'The type of game',
              },
              gameId: {
                type: 'string',
                description: 'The game ID',
              },
              player: {
                type: 'string',
                description: 'The player to analyze for',
              },
            },
            required: ['gameType', 'gameId', 'player'],
          },
        },
        {
          name: 'get_global_stats',
          description: 'Get comprehensive statistics about all games',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_game_type_stats',
          description: 'Get detailed statistics for a specific game type',
          inputSchema: {
            type: 'object',
            properties: {
              gameType: {
                type: 'string',
                description: 'The game type to get statistics for',
              },
            },
            required: ['gameType'],
          },
        },
      ];

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'list_games':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      games: this.gameManager.getAvailableGameTypes(),
                    },
                    null,
                    2
                  ),
                },
              ],
            };

          case 'get_game_metadata':
            const metadata = args?.gameType
              ? await this.gameManager.getGameMetadata(args.gameType as string)
              : await this.gameManager.getAllGameMetadata();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(metadata, null, 2),
                },
              ],
            };

          case 'create_game':
            if (!args?.gameType) {
              throw new Error('gameType is required');
            }
            const gameId = await this.gameManager.createGame(
              args.gameType as string,
              args.config as any
            );
            const initialState = await this.gameManager.getGameState(
              args.gameType as string,
              gameId
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      gameId,
                      initialState,
                    },
                    null,
                    2
                  ),
                },
              ],
            };

          case 'make_move':
            if (!args?.gameType || !args?.gameId || !args?.moveData) {
              throw new Error('gameType, gameId, and moveData are required');
            }
            const gameState = await this.gameManager.makeMove(
              args.gameType as string,
              args.gameId as string,
              args.moveData as any
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      gameState,
                    },
                    null,
                    2
                  ),
                },
              ],
            };

          case 'get_game_state':
            if (!args?.gameType || !args?.gameId) {
              throw new Error('gameType and gameId are required');
            }
            const currentState = await this.gameManager.getGameState(
              args.gameType as string,
              args.gameId as string
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(currentState, null, 2),
                },
              ],
            };

          case 'get_game_history':
            if (!args?.gameType || !args?.gameId) {
              throw new Error('gameType and gameId are required');
            }
            const history = await this.gameManager.getGameHistory(
              args.gameType as string,
              args.gameId as string
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      history,
                      moveCount: history.length,
                    },
                    null,
                    2
                  ),
                },
              ],
            };

          case 'analyze_game':
            if (!args?.gameType || !args?.gameId || !args?.player) {
              throw new Error('gameType, gameId, and player are required');
            }
            const analysisState = await this.gameManager.getGameState(
              args.gameType as string,
              args.gameId as string
            );

            const analysis = await this.analyzeGameState(
              args.gameType as string,
              analysisState,
              args.player as string
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(analysis, null, 2),
                },
              ],
            };

          case 'get_global_stats':
            const globalStats = await this.gameManager.getStatsService().getGlobalStats();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      stats: globalStats,
                    },
                    null,
                    2
                  ),
                },
              ],
            };

          case 'get_game_type_stats':
            if (!args?.gameType) {
              throw new Error('gameType is required');
            }
            const gameTypeStats = await this.gameManager
              .getStatsService()
              .getGameTypeStats(args.gameType as string);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      gameType: args.gameType,
                      stats: gameTypeStats,
                    },
                    null,
                    2
                  ),
                },
              ],
            };

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: true,
                  message: (error as Error).message,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async analyzeGameState(gameType: string, gameState: any, player: string) {
    // Basic game analysis - this could be enhanced with AI/ML models
    const analysis = {
      gameType,
      player,
      gameOver: gameState.gameOver,
      winner: gameState.winner,
      currentPlayer: gameState.currentPlayer,
      analysis: '',
      suggestedMoves: [] as any[],
    };

    if (gameState.gameOver) {
      analysis.analysis = `Game is over. Winner: ${gameState.winner}`;
      return analysis;
    }

    if (gameState.currentPlayer !== player) {
      analysis.analysis = `It's not ${player}'s turn. Current player: ${gameState.currentPlayer}`;
      return analysis;
    }

    // Game-specific analysis
    switch (gameType) {
      case 'tic-tac-toe':
        return this.analyzeTicTacToe(gameState, player);

      case 'connect-four':
        return this.analyzeConnectFour(gameState, player);

      case 'chess':
        return this.analyzeChess(gameState, player);

      case 'checkers':
        return this.analyzeCheckers(gameState, player);

      case 'omok':
        return this.analyzeOmok(gameState, player);

      case 'battleship':
        return this.analyzeBattleship(gameState, player);

      case 'blackjack':
        return this.analyzeBlackjack(gameState, player);

      case 'othello':
        return this.analyzeOthello(gameState, player);

      case 'mancala':
        return this.analyzeMancala(gameState, player);

      default:
        analysis.analysis = 'Game analysis not implemented for this game type';
        return analysis;
    }
  }

  private analyzeTicTacToe(gameState: any, player: string) {
    const board = gameState.board;
    const _opponent = player === 'X' ? 'O' : 'X';

    const analysis = {
      gameType: 'tic-tac-toe',
      player,
      gameOver: gameState.gameOver,
      winner: gameState.winner,
      currentPlayer: gameState.currentPlayer,
      analysis: '',
      suggestedMoves: [] as any[],
    };

    // Find available moves
    const availableMoves = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (board[row][col] === null) {
          availableMoves.push({ row, col, player });
        }
      }
    }

    // Check for winning moves
    const winningMoves = availableMoves.filter(move => {
      const testBoard = board.map((row: any[]) => [...row]);
      testBoard[move.row][move.col] = player;
      return this.checkTicTacToeWin(testBoard, player);
    });

    // Check for blocking moves (prevent opponent from winning)
    const blockingMoves = availableMoves.filter(move => {
      const testBoard = board.map((row: any[]) => [...row]);
      testBoard[move.row][move.col] = _opponent;
      return this.checkTicTacToeWin(testBoard, _opponent);
    });

    if (winningMoves.length > 0) {
      analysis.analysis = 'You can win this turn!';
      analysis.suggestedMoves = winningMoves;
    } else if (blockingMoves.length > 0) {
      analysis.analysis = 'You need to block your opponent from winning!';
      analysis.suggestedMoves = blockingMoves;
    } else {
      analysis.analysis = 'No immediate threats. Consider strategic positioning.';
      analysis.suggestedMoves = availableMoves.slice(0, 3); // Show first 3 options
    }

    return analysis;
  }

  private analyzeConnectFour(gameState: any, player: string) {
    const board = gameState.board;

    const analysis = {
      gameType: 'connect-four',
      player,
      gameOver: gameState.gameOver,
      winner: gameState.winner,
      currentPlayer: gameState.currentPlayer,
      analysis: '',
      suggestedMoves: [] as any[],
    };

    // Find available columns
    const availableColumns = [];
    for (let col = 0; col < 7; col++) {
      if (board[0]?.[col] === null) {
        availableColumns.push({ column: col, player });
      }
    }

    analysis.analysis = `${availableColumns.length} columns available for play.`;
    analysis.suggestedMoves = availableColumns;

    return analysis;
  }

  private analyzeChess(gameState: any, player: string) {
    const analysis = {
      gameType: 'chess',
      player,
      gameOver: gameState.gameOver,
      winner: gameState.winner,
      currentPlayer: gameState.currentPlayer,
      analysis: '',
      suggestedMoves: [] as any[],
    };

    if (gameState.inCheck) {
      analysis.analysis = `${player} is in check! Must move king to safety or block the attack.`;
    } else if (gameState.isCheckmate) {
      analysis.analysis = `Checkmate! Game over.`;
    } else {
      const pieceCount = this.countChessPieces(gameState.board, player);
      analysis.analysis = `${player} has ${pieceCount.total} pieces remaining. Focus on controlling the center and protecting your king.`;
    }

    return analysis;
  }

  private analyzeCheckers(gameState: any, player: string) {
    const analysis = {
      gameType: 'checkers',
      player,
      gameOver: gameState.gameOver,
      winner: gameState.winner,
      currentPlayer: gameState.currentPlayer,
      analysis: '',
      suggestedMoves: [] as any[],
    };

    const pieceCount = this.countCheckersPieces(gameState.board, player);
    const kingCount = pieceCount.kings;

    if (kingCount > 0) {
      analysis.analysis = `You have ${kingCount} kings! Use them to control the board and capture opponent pieces.`;
    } else {
      analysis.analysis = `Focus on advancing pieces to the opposite end to get kings. Look for capture opportunities.`;
    }

    return analysis;
  }

  private analyzeOmok(gameState: any, player: string) {
    const analysis = {
      gameType: 'omok',
      player,
      gameOver: gameState.gameOver,
      winner: gameState.winner,
      currentPlayer: gameState.currentPlayer,
      analysis: '',
      suggestedMoves: [] as any[],
    };

    // Look for potential winning sequences
    const threats = this.findOmokThreats(gameState.board, player);
    const _opponentThreats = this.findOmokThreats(
      gameState.board,
      player === 'black' ? 'white' : 'black'
    );

    if (threats.fourInRow > 0) {
      analysis.analysis = 'You have a four-in-a-row threat! You can win next turn!';
    } else if (_opponentThreats.fourInRow > 0) {
      analysis.analysis = 'Opponent has a four-in-a-row threat! You must block immediately!';
    } else if (threats.threeInRow > 0) {
      analysis.analysis = `You have ${threats.threeInRow} three-in-a-row sequences. Build on them!`;
    } else {
      analysis.analysis = 'Focus on building connected sequences while blocking opponent threats.';
    }

    return analysis;
  }

  private analyzeBattleship(gameState: any, player: string) {
    const analysis = {
      gameType: 'battleship',
      player,
      gameOver: gameState.gameOver,
      winner: gameState.winner,
      currentPlayer: gameState.currentPlayer,
      analysis: '',
      suggestedMoves: [] as any[],
    };

    const playerBoard = gameState[`${player}Board`];
    const shotBoard = gameState[`${player}Shots`];

    if (playerBoard) {
      const hits = this.countBattleshipHits(shotBoard);
      const shipsRemaining = gameState[`${player}ShipsRemaining`] || 0;

      analysis.analysis = `You've made ${hits} hits. ${shipsRemaining} enemy ships remaining. Look for patterns around hits to find full ships.`;
    } else {
      analysis.analysis =
        'Focus on systematic searching. Try a checkerboard pattern to maximize coverage.';
    }

    return analysis;
  }

  private analyzeBlackjack(gameState: any, player: string) {
    const analysis = {
      gameType: 'blackjack',
      player,
      gameOver: gameState.gameOver,
      winner: gameState.winner,
      currentPlayer: gameState.currentPlayer,
      analysis: '',
      suggestedMoves: [] as any[],
    };

    const playerHand = gameState.playerHands?.[0];
    const dealerUpCard = gameState.dealerHand?.cards?.[1];

    if (playerHand && dealerUpCard) {
      const handValue = playerHand.value;
      const dealerValue = this.getCardValue(dealerUpCard.rank);

      if (handValue === 21) {
        analysis.analysis = 'Blackjack! You have 21.';
      } else if (handValue > 21) {
        analysis.analysis = 'Bust! Hand value over 21.';
      } else if (handValue >= 17) {
        analysis.analysis = `Hand value ${handValue}. Consider standing - risk of busting is high.`;
        analysis.suggestedMoves = [{ action: 'stand', player }];
      } else if (handValue <= 11) {
        analysis.analysis = `Hand value ${handValue}. Safe to hit - cannot bust.`;
        analysis.suggestedMoves = [{ action: 'hit', player }];
      } else {
        // Basic strategy based on dealer up card
        if (dealerValue >= 7) {
          analysis.analysis = `Dealer showing ${dealerUpCard.rank} (strong). Consider hitting to improve your ${handValue}.`;
          analysis.suggestedMoves = [{ action: 'hit', player }];
        } else {
          analysis.analysis = `Dealer showing ${dealerUpCard.rank} (weak). Consider standing on ${handValue}.`;
          analysis.suggestedMoves = [{ action: 'stand', player }];
        }
      }
    }

    return analysis;
  }

  private analyzeOthello(gameState: any, player: string) {
    const analysis = {
      gameType: 'othello',
      player,
      gameOver: gameState.gameOver,
      winner: gameState.winner,
      currentPlayer: gameState.currentPlayer,
      analysis: '',
      suggestedMoves: [] as any[],
    };

    const validMoves = gameState.validMoves || [];
    const playerScore = gameState[`${player}Score`] || 0;
    const opponentScore = gameState[player === 'black' ? 'whiteScore' : 'blackScore'] || 0;

    if (validMoves.length === 0) {
      analysis.analysis = 'No valid moves available - you must pass.';
    } else {
      const cornerMoves = validMoves.filter(
        (move: any) => (move[0] === 0 || move[0] === 7) && (move[1] === 0 || move[1] === 7)
      );

      if (cornerMoves.length > 0) {
        analysis.analysis = 'Corner move available! Corners are very valuable in Othello.';
        analysis.suggestedMoves = cornerMoves.map((move: any) => ({
          row: move[0],
          col: move[1],
          player,
        }));
      } else {
        analysis.analysis = `Score: You ${playerScore}, Opponent ${opponentScore}. Look for moves that flip many pieces.`;
        analysis.suggestedMoves = validMoves
          .slice(0, 3)
          .map((move: any) => ({ row: move[0], col: move[1], player }));
      }
    }

    return analysis;
  }

  private analyzeMancala(gameState: any, player: string) {
    const analysis = {
      gameType: 'mancala',
      player,
      gameOver: gameState.gameOver,
      winner: gameState.winner,
      currentPlayer: gameState.currentPlayer,
      analysis: '',
      suggestedMoves: [] as any[],
    };

    const validMoves = gameState.validMoves || [];
    const playerScore = gameState[`${player}Score`] || 0;
    const opponentPlayer = player === 'player1' ? 'player2' : 'player1';
    const opponentScore = gameState[`${opponentPlayer}Score`] || 0;

    if (validMoves.length === 0) {
      analysis.analysis = 'No valid moves - all your pits are empty.';
    } else {
      // Look for moves that give extra turns (end in store)
      const extraTurnMoves = this.findMancalaExtraTurnMoves(gameState.board, validMoves, player);

      if (extraTurnMoves.length > 0) {
        analysis.analysis = 'You can get extra turns! Choose moves that end in your store.';
        analysis.suggestedMoves = extraTurnMoves.map(pit => ({ pit, player }));
      } else {
        analysis.analysis = `Score: You ${playerScore}, Opponent ${opponentScore}. Look for capture opportunities.`;
        analysis.suggestedMoves = validMoves.slice(0, 3).map((pit: any) => ({ pit, player }));
      }
    }

    return analysis;
  }

  // Helper methods for analysis
  private countChessPieces(board: any[][], player: string) {
    let total = 0;
    let queens = 0;
    let rooks = 0;

    for (const row of board) {
      for (const piece of row) {
        if (piece && piece.color === player) {
          total++;
          if (piece.type === 'queen') {
            queens++;
          }
          if (piece.type === 'rook') {
            rooks++;
          }
        }
      }
    }

    return { total, queens, rooks };
  }

  private countCheckersPieces(board: any[][], player: string) {
    let total = 0;
    let kings = 0;

    for (const row of board) {
      for (const piece of row) {
        if (piece && piece.color === player) {
          total++;
          if (piece.isKing) {
            kings++;
          }
        }
      }
    }

    return { total, kings };
  }

  private findOmokThreats(board: any[][], player: string) {
    let threeInRow = 0;
    let fourInRow = 0;

    // This is a simplified threat detection
    // In a real implementation, you'd check all directions for sequences
    for (let row = 0; row < 15; row++) {
      for (let col = 0; col < 15; col++) {
        if (board[row]?.[col] === player) {
          // Check horizontal
          let count = 1;
          for (let c = col + 1; c < 15 && board[row]?.[c] === player; c++) {
            count++;
          }
          if (count === 3) {
            threeInRow++;
          }
          if (count === 4) {
            fourInRow++;
          }
        }
      }
    }

    return { threeInRow, fourInRow };
  }

  private countBattleshipHits(shotBoard: any[][]) {
    let hits = 0;
    for (const row of shotBoard) {
      for (const cell of row) {
        if (cell === 'hit') {
          hits++;
        }
      }
    }
    return hits;
  }

  private getCardValue(rank: string): number {
    if (['J', 'Q', 'K'].includes(rank)) {
      return 10;
    }
    if (rank === 'A') {
      return 11;
    }
    return parseInt(rank) || 10;
  }

  private findMancalaExtraTurnMoves(
    board: number[],
    validMoves: number[],
    player: string
  ): number[] {
    const extraTurnMoves = [];
    const playerStore = player === 'player1' ? 6 : 13;

    for (const pit of validMoves) {
      const stones = board[pit] || 0;
      const endPosition = (pit + stones) % 14;
      if (endPosition === playerStore) {
        extraTurnMoves.push(pit);
      }
    }

    return extraTurnMoves;
  }

  private checkTicTacToeWin(board: any[][], player: string): boolean {
    // Check rows
    for (let row = 0; row < 3; row++) {
      if (board[row]?.[0] === player && board[row]?.[1] === player && board[row]?.[2] === player) {
        return true;
      }
    }

    // Check columns
    for (let col = 0; col < 3; col++) {
      if (board[0]?.[col] === player && board[1]?.[col] === player && board[2]?.[col] === player) {
        return true;
      }
    }

    // Check diagonals
    if (board[0]?.[0] === player && board[1]?.[1] === player && board[2]?.[2] === player) {
      return true;
    }

    if (board[0]?.[2] === player && board[1]?.[1] === player && board[2]?.[0] === player) {
      return true;
    }

    return false;
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('🤖 Versus Game MCP Server started');
  }
}

// Start MCP server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const mcpServer = new VersusGameMCPServer();
  mcpServer.start().catch(error => {
    logger.error('MCP Server failed to start', {
      error: error instanceof Error ? error.message : error,
    });
  });
}
