import chalk from 'chalk';
import ora from 'ora';
import { VersusClient } from '../versus-client.js';

export const gamesCommand = {
  async list(this: any) {
    const client: VersusClient = this.client;
    const opts = this.opts ? this.opts() : {};
    
    try {
      const spinner = opts.json ? null : ora('Loading games...').start();
      const games = await client.listGames();
      if (spinner) spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(games));
      } else {
        console.log(chalk.cyan('\n🎮 Available Games:\n'));
        games.forEach((game) => {
          const complexity = game.complexity === 'easy' ? chalk.green('●') : 
                            game.complexity === 'medium' ? chalk.yellow('●') : chalk.red('●');
          console.log(`${complexity} ${chalk.bold(game.name)} (${game.type})`);
          console.log(`  ${chalk.gray(game.description)}`);
          console.log(`  Players: ${game.minPlayers}-${game.maxPlayers} | Complexity: ${game.complexity}\n`);
        });
        console.log(chalk.gray('Run "versus games info <game-type>" for details'));
      }
    } catch (error: any) {
      if (opts.json) {
        console.log(JSON.stringify({ error: error.message }));
      } else {
        console.log(chalk.red(`Error: ${error.message}`));
      }
    }
  },

  async info(this: any, gameType: string) {
    const client: VersusClient = this.client;
    const opts = this.opts ? this.opts() : {};

    try {
      const spinner = opts.json ? null : ora('Loading game info...').start();
      const game = await client.getGameInfo(gameType);
      if (spinner) spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(game));
      } else {
        console.log(chalk.cyan(`\n📋 ${game.name}\n`));
        console.log(`Type: ${chalk.bold(game.type)}`);
        console.log(`Description: ${game.description}`);
        console.log(`Players: ${game.minPlayers}-${game.maxPlayers}`);
        console.log(`Complexity: ${game.complexity}`);
        console.log(chalk.gray(`\nRun "versus play ${game.type}" to start a game`));
      }
    } catch (error: any) {
      if (opts.json) {
        console.log(JSON.stringify({ error: error.message }));
      } else {
        console.log(chalk.red(`Error: ${error.message}`));
      }
    }
  },

  async play(this: any, gameType: string) {
    const client: VersusClient = this.client;
    const opts = this.opts ? this.opts() : {};
    const options = this.opts ? this.opts() : {};

    try {
      const spinner = opts.json ? null : ora(`Creating ${gameType} game...`).start();
      const result = await client.createGame(gameType, options.mode, {
        opponent: options.opponent,
        stake: options.stake ? parseFloat(options.stake) : undefined,
      });
      if (spinner) spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(result));
      } else {
        console.log(chalk.green(`✓ Game created!`));
        console.log(`Game ID: ${chalk.bold(result.gameId)}`);
        console.log(`Room ID: ${chalk.bold(result.roomId)}`);
        
        if (options.wait) {
          console.log(chalk.yellow('\nWaiting for match...'));
          // In a real implementation, this would wait via WebSocket
        } else {
          console.log(chalk.gray('\nUse "versus state ' + result.gameId + '" to check game status'));
        }
      }
    } catch (error: any) {
      if (opts.json) {
        console.log(JSON.stringify({ error: error.message }));
      } else {
        console.log(chalk.red(`Error: ${error.message}`));
      }
    }
  },

  async active(this: any) {
    const client: VersusClient = this.client;
    const opts = this.opts ? this.opts() : {};

    try {
      const spinner = opts.json ? null : ora('Loading active games...').start();
      const games = await client.listActiveGames();
      if (spinner) spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(games));
      } else {
        if (games.length === 0) {
          console.log(chalk.yellow('No active games'));
          return;
        }

        console.log(chalk.cyan('\n🎮 Active Games:\n'));
        games.forEach((game) => {
          const status = game.gameOver ? chalk.red('Finished') : chalk.green('In Progress');
          console.log(`${chalk.bold(game.gameId)} - ${game.gameType}`);
          console.log(`Status: ${status}`);
          if (game.winner) {
            console.log(`Winner: ${chalk.green(game.winner)}`);
          }
          console.log(`Current Player: ${game.currentPlayer}\n`);
        });
      }
    } catch (error: any) {
      if (opts.json) {
        console.log(JSON.stringify({ error: error.message }));
      } else {
        console.log(chalk.red(`Error: ${error.message}`));
      }
    }
  },

  async move(this: any, gameId: string, moveDataStr: string) {
    const client: VersusClient = this.client;
    const opts = this.opts ? this.opts() : {};

    try {
      const moveData = JSON.parse(moveDataStr);
      const spinner = opts.json ? null : ora('Making move...').start();
      const state = await client.makeMove(gameId, moveData);
      if (spinner) spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(state));
      } else {
        console.log(chalk.green('✓ Move made'));
        if (state.gameOver) {
          console.log(chalk.yellow('\nGame Over!'));
          if (state.winner) {
            console.log(`Winner: ${chalk.green(state.winner)}`);
          } else {
            console.log('It\'s a draw!');
          }
        }
      }
    } catch (error: any) {
      if (opts.json) {
        console.log(JSON.stringify({ error: error.message }));
      } else {
        console.log(chalk.red(`Error: ${error.message}`));
      }
    }
  },

  async state(this: any, gameId: string) {
    const client: VersusClient = this.client;
    const opts = this.opts ? this.opts() : {};

    try {
      const spinner = opts.json ? null : ora('Loading game state...').start();
      const state = await client.getGameState(gameId);
      if (spinner) spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(state));
      } else {
        console.log(chalk.cyan(`\n🎮 Game: ${gameId}`));
        console.log(`Type: ${state.gameType}`);
        console.log(`Current Player: ${state.currentPlayer}`);
        console.log(`Status: ${state.gameOver ? chalk.red('Finished') : chalk.green('In Progress')}`);
        if (state.winner) {
          console.log(`Winner: ${chalk.green(state.winner)}`);
        }
      }
    } catch (error: any) {
      if (opts.json) {
        console.log(JSON.stringify({ error: error.message }));
      } else {
        console.log(chalk.red(`Error: ${error.message}`));
      }
    }
  },

  async forfeit(this: any, gameId: string) {
    const client: VersusClient = this.client;
    const opts = this.opts ? this.opts() : {};

    try {
      const spinner = opts.json ? null : ora('Forfeiting game...').start();
      await client.forfeitGame(gameId);
      if (spinner) spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify({ success: true }));
      } else {
        console.log(chalk.yellow('Game forfeited'));
      }
    } catch (error: any) {
      if (opts.json) {
        console.log(JSON.stringify({ error: error.message }));
      } else {
        console.log(chalk.red(`Error: ${error.message}`));
      }
    }
  },
};
