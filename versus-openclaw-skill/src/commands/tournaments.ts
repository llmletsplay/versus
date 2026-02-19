import chalk from 'chalk';
import ora from 'ora';
import { VersusClient } from '../versus-client.js';

export const tournamentsCommand = {
  async list(this: any) {
    const client: VersusClient = this.client;
    const opts = this.opts ? this.opts() : {};
    const options = this.opts ? this.opts() : {};

    try {
      const spinner = opts.json ? null : ora('Loading tournaments...').start();
      const tournaments = await client.listTournaments({
        status: options.status,
        game: options.game,
        entryFeeMax: options.entryFeeMax ? parseFloat(options.entryFeeMax) : undefined,
      });
      if (spinner) spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(tournaments));
      } else {
        if (tournaments.length === 0) {
          console.log(chalk.yellow('No tournaments found'));
          return;
        }

        console.log(chalk.cyan('\n🏆 Tournaments:\n'));
        tournaments.forEach((t) => {
          const statusColor = t.status === 'active' ? chalk.green :
                             t.status === 'upcoming' ? chalk.yellow : chalk.gray;
          console.log(`${chalk.bold(t.name)}`);
          console.log(`  Game: ${t.gameType} | Format: ${t.format}`);
          console.log(`  Status: ${statusColor(t.status)}`);
          console.log(`  Entry Fee: ${t.entryFee > 0 ? chalk.yellow(t.entryFee + ' USDC') : chalk.green('Free')}`);
          console.log(`  Prize Pool: ${chalk.green(t.prizePool + ' USDC')}`);
          console.log(`  Players: ${t.currentPlayers}/${t.maxPlayers}`);
          console.log(`  ID: ${chalk.gray(t.id)}\n`);
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

  async info(this: any, tournamentId: string) {
    const client: VersusClient = this.client;
    const opts = this.opts ? this.opts() : {};

    try {
      const spinner = opts.json ? null : ora('Loading tournament info...').start();
      const tournament = await client.getTournament(tournamentId);
      if (spinner) spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(tournament));
      } else {
        console.log(chalk.cyan(`\n🏆 ${tournament.name}\n`));
        console.log(`Game: ${tournament.gameType}`);
        console.log(`Format: ${tournament.format}`);
        console.log(`Status: ${tournament.status}`);
        console.log(`Entry Fee: ${tournament.entryFee} USDC`);
        console.log(`Prize Pool: ${tournament.prizePool} USDC`);
        console.log(`Players: ${tournament.currentPlayers}/${tournament.maxPlayers}`);
        console.log(`Starts: ${new Date(tournament.startsAt).toLocaleString()}`);
        console.log(chalk.gray(`\nRun "versus tournaments join ${tournament.id}" to enter`));
      }
    } catch (error: any) {
      if (opts.json) {
        console.log(JSON.stringify({ error: error.message }));
      } else {
        console.log(chalk.red(`Error: ${error.message}`));
      }
    }
  },

  async join(this: any, tournamentId: string) {
    const client: VersusClient = this.client;
    const opts = this.opts ? this.opts() : {};

    try {
      const spinner = opts.json ? null : ora('Joining tournament...').start();
      await client.joinTournament(tournamentId);
      if (spinner) spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify({ success: true }));
      } else {
        console.log(chalk.green('✓ Successfully joined tournament!'));
        console.log(chalk.gray('You will be notified when the tournament starts.'));
      }
    } catch (error: any) {
      if (opts.json) {
        console.log(JSON.stringify({ error: error.message }));
      } else {
        console.log(chalk.red(`Error: ${error.message}`));
      }
    }
  },

  async create(this: any) {
    const client: VersusClient = this.client;
    const opts = this.opts ? this.opts() : {};
    const options = this.opts ? this.opts() : {};

    try {
      const spinner = opts.json ? null : ora('Creating tournament...').start();
      const tournament = await client.createTournament({
        name: options.name,
        gameType: options.game,
        format: options.format,
        entryFee: options.entryFee ? parseFloat(options.entryFee) : 0,
        prizePool: options.prizePool ? parseFloat(options.prizePool) : 0,
        maxPlayers: options.maxPlayers ? parseInt(options.maxPlayers) : 16,
      });
      if (spinner) spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(tournament));
      } else {
        console.log(chalk.green('✓ Tournament created!'));
        console.log(`Name: ${chalk.bold(tournament.name)}`);
        console.log(`ID: ${chalk.gray(tournament.id)}`);
        console.log(chalk.gray('\nInvite others to join with:'));
        console.log(chalk.gray(`versus tournaments join ${tournament.id}`));
      }
    } catch (error: any) {
      if (opts.json) {
        console.log(JSON.stringify({ error: error.message }));
      } else {
        console.log(chalk.red(`Error: ${error.message}`));
      }
    }
  },

  async my(this: any) {
    const client: VersusClient = this.client;
    const opts = this.opts ? this.opts() : {};

    try {
      const spinner = opts.json ? null : ora('Loading your tournaments...').start();
      const tournaments = await client.listMyTournaments();
      if (spinner) spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(tournaments));
      } else {
        if (tournaments.length === 0) {
          console.log(chalk.yellow('You are not in any tournaments'));
          return;
        }

        console.log(chalk.cyan('\n🏆 Your Tournaments:\n'));
        tournaments.forEach((t) => {
          const statusColor = t.status === 'active' ? chalk.green : chalk.gray;
          console.log(`${chalk.bold(t.name)} ${statusColor(`[${t.status}]`)}`);
          console.log(`  ${t.gameType} | Prize: ${t.prizePool} USDC\n`);
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
