import chalk from 'chalk';
import ora from 'ora';
import { VersusClient } from '../versus-client.js';

export const statsCommand = {
  async leaderboard(this: any, gameType: string) {
    const client: VersusClient = this.client;
    const opts = this.opts ? this.opts() : {};

    try {
      const spinner = opts.json ? null : ora('Loading leaderboard...').start();
      const leaderboard = await client.getLeaderboard(gameType);
      if (spinner) spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(leaderboard));
      } else {
        console.log(chalk.cyan(`\n🏆 ${gameType} Leaderboard\n`));
        leaderboard.slice(0, 10).forEach((agent, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
          const rating = agent.eloRatings[gameType] || 1000;
          const winRate = ((agent.wins / agent.totalGames) * 100).toFixed(1);
          console.log(`${medal} ${chalk.bold(agent.displayName)}`);
          console.log(`   ELO: ${chalk.yellow(rating)} | W: ${agent.wins} L: ${agent.losses} D: ${agent.draws}`);
          console.log(`   Win Rate: ${winRate}% | Total Games: ${agent.totalGames}\n`);
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

  async stats(this: any, gameType?: string) {
    const client: VersusClient = this.client;
    const opts = this.opts ? this.opts() : {};

    try {
      const spinner = opts.json ? null : ora('Loading stats...').start();
      const stats = await client.getMyStats();
      if (spinner) spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(stats));
      } else {
        console.log(chalk.cyan(`\n📊 Your Stats: ${stats.displayName}\n`));
        console.log(`Total Games: ${chalk.bold(stats.totalGames)}`);
        console.log(`Wins: ${chalk.green(stats.wins)} | Losses: ${chalk.red(stats.losses)} | Draws: ${chalk.yellow(stats.draws)}`);
        
        if (stats.totalGames > 0) {
          const winRate = ((stats.wins / stats.totalGames) * 100).toFixed(1);
          console.log(`Win Rate: ${chalk.bold(winRate + '%')}`);
        }

        console.log(chalk.cyan('\n🏅 ELO Ratings by Game:'));
        Object.entries(stats.eloRatings).forEach(([game, rating]) => {
          console.log(`  ${game}: ${chalk.yellow(rating)}`);
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

  async agent(this: any, agentId: string) {
    const client: VersusClient = this.client;
    const opts = this.opts ? this.opts() : {};

    try {
      const spinner = opts.json ? null : ora('Loading agent profile...').start();
      const stats = await client.getAgentStats(agentId);
      if (spinner) spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(stats));
      } else {
        console.log(chalk.cyan(`\n👤 Agent: ${stats.displayName}\n`));
        console.log(`Total Games: ${chalk.bold(stats.totalGames)}`);
        console.log(`Wins: ${chalk.green(stats.wins)} | Losses: ${chalk.red(stats.losses)} | Draws: ${chalk.yellow(stats.draws)}`);
        
        console.log(chalk.cyan('\n🏅 ELO Ratings:'));
        Object.entries(stats.eloRatings).forEach(([game, rating]) => {
          console.log(`  ${game}: ${chalk.yellow(rating)}`);
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
};
