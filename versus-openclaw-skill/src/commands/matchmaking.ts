import chalk from 'chalk';
import ora from 'ora';
import { VersusClient } from '../versus-client.js';

export const matchmakingCommand = {
  async queue(this: any, gameType: string) {
    const client: VersusClient = this.client;
    const opts = this.opts ? this.opts() : {};
    const options = this.opts ? this.opts() : {};

    try {
      const spinner = opts.json ? null : ora('Joining matchmaking queue...').start();
      await client.joinQueue(
        gameType,
        options.mode || 'casual',
        options.ratingRange ? parseInt(options.ratingRange) : 200
      );
      if (spinner) spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify({ success: true }));
      } else {
        console.log(chalk.green('✓ Joined matchmaking queue'));
        console.log(chalk.gray('Run "versus matchmaking status" to check your position'));
      }
    } catch (error: any) {
      if (opts.json) {
        console.log(JSON.stringify({ error: error.message }));
      } else {
        console.log(chalk.red(`Error: ${error.message}`));
      }
    }
  },

  async status(this: any) {
    const client: VersusClient = this.client;
    const opts = this.opts ? this.opts() : {};

    try {
      const spinner = opts.json ? null : ora('Checking queue status...').start();
      const status = await client.getQueueStatus();
      if (spinner) spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(status));
      } else {
        console.log(chalk.cyan('\n📊 Matchmaking Status\n'));
        console.log(`Position in queue: ${chalk.bold(status.position)}`);
        console.log(`Estimated wait: ${chalk.gray(status.estimatedWait + ' seconds')}`);
      }
    } catch (error: any) {
      if (opts.json) {
        console.log(JSON.stringify({ error: error.message }));
      } else {
        console.log(chalk.red(`Error: ${error.message}`));
      }
    }
  },

  async leave(this: any) {
    const client: VersusClient = this.client;
    const opts = this.opts ? this.opts() : {};

    try {
      const spinner = opts.json ? null : ora('Leaving queue...').start();
      await client.leaveQueue();
      if (spinner) spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify({ success: true }));
      } else {
        console.log(chalk.green('✓ Left matchmaking queue'));
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
