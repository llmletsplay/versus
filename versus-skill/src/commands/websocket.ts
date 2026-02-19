import chalk from 'chalk';
import { VersusClient } from '../versus-client.js';

let wsClient: VersusClient | null = null;

export const wsCommand = {
  async connect(this: any) {
    const client: VersusClient = this.client;
    const opts = this.opts ? this.opts() : {};

    try {
      client.connectWebSocket();
      wsClient = client;

      client.on('connected', () => {
        if (!opts.json) {
          console.log(chalk.green('✓ Connected to real-time updates'));
        }
      });

      client.on('game:started', (payload: any) => {
        if (opts.json) {
          console.log(JSON.stringify({ type: 'game:started', payload }));
        } else {
          console.log(chalk.cyan('\n🎮 Game Started!'));
          console.log(`Game ID: ${payload.gameId}`);
          console.log(`Opponent: ${payload.opponentId}`);
        }
      });

      client.on('game:move', (payload: any) => {
        if (opts.json) {
          console.log(JSON.stringify({ type: 'game:move', payload }));
        } else {
          console.log(chalk.yellow(`\n↪ Opponent moved: ${JSON.stringify(payload.move)}`));
        }
      });

      client.on('game:over', (payload: any) => {
        if (opts.json) {
          console.log(JSON.stringify({ type: 'game:over', payload }));
        } else {
          console.log(chalk.cyan('\n🏁 Game Over!'));
          if (payload.winner) {
            console.log(`Winner: ${chalk.green(payload.winner)}`);
          } else {
            console.log('It\'s a draw!');
          }
        }
      });

      client.on('wager:accepted', (payload: any) => {
        if (!opts.json) {
          console.log(chalk.green(`\n💰 Wager accepted! Game ID: ${payload.gameId}`));
        }
      });

      client.on('tournament:starting', (payload: any) => {
        if (!opts.json) {
          console.log(chalk.cyan(`\n🏆 Tournament starting: ${payload.tournamentName}`));
        }
      });

      client.on('tournament:match', (payload: any) => {
        if (!opts.json) {
          console.log(chalk.yellow(`\n⚔️ Your tournament match is ready!`));
          console.log(`Game ID: ${payload.gameId}`);
          console.log(`Opponent: ${payload.opponentId}`);
        }
      });

      client.on('error', (error: any) => {
        if (opts.json) {
          console.log(JSON.stringify({ error: error.message }));
        } else {
          console.log(chalk.red(`\nError: ${error.message}`));
        }
      });

      client.on('disconnected', () => {
        if (!opts.json) {
          console.log(chalk.yellow('\nDisconnected from server'));
        }
      });

      // Keep the process running
      process.stdin.resume();

    } catch (error: any) {
      if (opts.json) {
        console.log(JSON.stringify({ error: error.message }));
      } else {
        console.log(chalk.red(`Error: ${error.message}`));
      }
    }
  },

  async subscribe(this: any, gameId: string) {
    const opts = this.opts ? this.opts() : {};

    try {
      if (!wsClient) {
        throw new Error('Not connected. Run "versus ws connect" first');
      }

      wsClient.subscribeToGame(gameId);

      if (opts.json) {
        console.log(JSON.stringify({ success: true, gameId }));
      } else {
        console.log(chalk.green(`✓ Subscribed to game: ${gameId}`));
      }
    } catch (error: any) {
      if (opts.json) {
        console.log(JSON.stringify({ error: error.message }));
      } else {
        console.log(chalk.red(`Error: ${error.message}`));
      }
    }
  },

  async disconnect(this: any) {
    const opts = this.opts ? this.opts() : {};

    try {
      if (wsClient) {
        wsClient.disconnectWebSocket();
        wsClient = null;
      }

      if (opts.json) {
        console.log(JSON.stringify({ success: true }));
      } else {
        console.log(chalk.green('✓ Disconnected'));
      }

      process.exit(0);
    } catch (error: any) {
      if (opts.json) {
        console.log(JSON.stringify({ error: error.message }));
      } else {
        console.log(chalk.red(`Error: ${error.message}`));
      }
    }
  },
};
