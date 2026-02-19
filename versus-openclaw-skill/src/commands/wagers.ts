import chalk from 'chalk';
import ora from 'ora';
import { VersusClient } from '../versus-client.js';

export const wagersCommand = {
  async list(this: any) {
    const client: VersusClient = this.client;
    const opts = this.opts ? this.opts() : {};
    const options = this.opts ? this.opts() : {};

    try {
      const spinner = opts.json ? null : ora('Loading wagers...').start();
      const wagers = await client.listWagers({
        game: options.game,
        minStake: options.minStake ? parseFloat(options.minStake) : undefined,
        maxStake: options.maxStake ? parseFloat(options.maxStake) : undefined,
      });
      if (spinner) spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(wagers));
      } else {
        if (wagers.length === 0) {
          console.log(chalk.yellow('No open wagers found'));
          return;
        }

        console.log(chalk.cyan('\n💰 Open Wagers:\n'));
        wagers.forEach((w) => {
          console.log(`${chalk.bold(w.id)} - ${w.gameType}`);
          console.log(`  Stake: ${chalk.yellow(w.stake + ' USDC')}`);
          console.log(`  Creator: ${chalk.gray(w.creatorId)}`);
          console.log(`  Status: ${w.status}\n`);
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

  async create(this: any, gameType: string, stake: string) {
    const client: VersusClient = this.client;
    const opts = this.opts ? this.opts() : {};
    const options = this.opts ? this.opts() : {};

    try {
      const spinner = opts.json ? null : ora('Creating wager...').start();
      const wager = await client.createWager(
        gameType,
        parseFloat(stake),
        options.opponent,
        options.conditions ? JSON.parse(options.conditions) : undefined
      );
      if (spinner) spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(wager));
      } else {
        console.log(chalk.green('✓ Wager created!'));
        console.log(`ID: ${chalk.bold(wager.id)}`);
        console.log(`Game: ${wager.gameType}`);
        console.log(`Stake: ${chalk.yellow(wager.stake + ' USDC')}`);
        if (options.opponent) {
          console.log(`Opponent: ${chalk.gray(options.opponent)}`);
        } else {
          console.log(chalk.gray('Waiting for opponent to accept...'));
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

  async accept(this: any, wagerId: string) {
    const client: VersusClient = this.client;
    const opts = this.opts ? this.opts() : {};

    try {
      const spinner = opts.json ? null : ora('Accepting wager...').start();
      await client.acceptWager(wagerId);
      if (spinner) spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify({ success: true }));
      } else {
        console.log(chalk.green('✓ Wager accepted!'));
        console.log(chalk.gray('Game will start automatically once both parties pay.'));
      }
    } catch (error: any) {
      if (opts.json) {
        console.log(JSON.stringify({ error: error.message }));
      } else {
        console.log(chalk.red(`Error: ${error.message}`));
      }
    }
  },

  async cancel(this: any, wagerId: string) {
    const client: VersusClient = this.client;
    const opts = this.opts ? this.opts() : {};

    try {
      const spinner = opts.json ? null : ora('Cancelling wager...').start();
      await client.cancelWager(wagerId);
      if (spinner) spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify({ success: true }));
      } else {
        console.log(chalk.green('✓ Wager cancelled'));
      }
    } catch (error: any) {
      if (opts.json) {
        console.log(JSON.stringify({ error: error.message }));
      } else {
        console.log(chalk.red(`Error: ${error.message}`));
      }
    }
  },

  async info(this: any, wagerId: string) {
    const client: VersusClient = this.client;
    const opts = this.opts ? this.opts() : {};

    try {
      const spinner = opts.json ? null : ora('Loading wager info...').start();
      const wager = await client.getWager(wagerId);
      if (spinner) spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(wager));
      } else {
        console.log(chalk.cyan(`\n💰 Wager: ${wager.id}\n`));
        console.log(`Game: ${wager.gameType}`);
        console.log(`Stake: ${chalk.yellow(wager.stake + ' USDC')}`);
        console.log(`Status: ${wager.status}`);
        console.log(`Creator: ${chalk.gray(wager.creatorId)}`);
        if (wager.opponentId) {
          console.log(`Opponent: ${chalk.gray(wager.opponentId)}`);
        }
        if (wager.winner) {
          console.log(`Winner: ${chalk.green(wager.winner)}`);
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
};
