#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { VersusClient } from './versus-client.js';
import { loadConfig, saveConfig } from './config.js';
import { setupCommand } from './commands/setup.js';
import { gamesCommand } from './commands/games.js';
import { tournamentsCommand } from './commands/tournaments.js';
import { wagersCommand } from './commands/wagers.js';
import { matchmakingCommand } from './commands/matchmaking.js';
import { statsCommand } from './commands/stats.js';
import { wsCommand } from './commands/websocket.js';

const program = new Command();

program
  .name('versus')
  .description('VERSUS Gaming Platform - Play games, join tournaments, create wagers')
  .version('1.0.0');

// Global options
program.option('-j, --json', 'Output JSON for machine-readable format');
program.option('-v, --verbose', 'Verbose output');

// Middleware to setup client
program.hook('preAction', async (thisCommand) => {
  const opts = thisCommand.opts();
  const config = await loadConfig();
  
  if (!config.apiKey && thisCommand.name() !== 'setup') {
    if (opts.json) {
      console.log(JSON.stringify({ error: 'Not configured. Run: versus setup' }));
    } else {
      console.log(chalk.red('Not configured. Run: versus setup'));
    }
    process.exit(1);
  }

  // Attach client to command
  if (config.apiKey) {
    (thisCommand as any).client = new VersusClient({
      apiKey: config.apiKey,
      apiUrl: config.apiUrl || 'https://api.versus.gg',
      wsUrl: config.wsUrl || 'wss://ws.versus.gg',
    });
    (thisCommand as any).config = config;
  }
});

// Setup
program
  .command('setup')
  .description('Interactive setup (create account, configure API key, wallet)')
  .action(setupCommand);

// Games
const gamesCmd = program
  .command('games')
  .description('Game management commands');

gamesCmd
  .command('list')
  .description('List all available games')
  .action(gamesCommand.list);

gamesCmd
  .command('info <game-type>')
  .description('Get details about a specific game')
  .action(gamesCommand.info);

// Play
program
  .command('play <game-type>')
  .description('Start a game')
  .option('-m, --mode <mode>', 'Game mode: casual, ranked, wager', 'casual')
  .option('-o, --opponent <id>', 'Challenge specific opponent')
  .option('-s, --stake <amount>', 'Wager amount (for wager mode)')
  .option('-w, --wait', 'Wait for match')
  .action(gamesCommand.play);

// Active games
gamesCmd
  .command('active')
  .description('List your active games')
  .action(gamesCommand.active);

// Move
program
  .command('move <game-id> <move-data>')
  .description('Make a move in an active game')
  .action(gamesCommand.move);

// Game state
program
  .command('state <game-id>')
  .description('Get current game state')
  .action(gamesCommand.state);

// Forfeit
program
  .command('forfeit <game-id>')
  .description('Forfeit an active game')
  .action(gamesCommand.forfeit);

// Tournaments
const tournamentCmd = program
  .command('tournaments')
  .alias('t')
  .description('Tournament commands');

tournamentCmd
  .command('list')
  .description('Browse available tournaments')
  .option('-s, --status <status>', 'Filter by status: upcoming, active, completed')
  .option('-g, --game <type>', 'Filter by game type')
  .option('--entry-fee-max <amount>', 'Max entry fee')
  .action(tournamentsCommand.list);

tournamentCmd
  .command('info <tournament-id>')
  .description('Get tournament details')
  .action(tournamentsCommand.info);

tournamentCmd
  .command('join <tournament-id>')
  .description('Join a tournament')
  .action(tournamentsCommand.join);

tournamentCmd
  .command('create')
  .description('Create a new tournament')
  .requiredOption('-n, --name <name>', 'Tournament name')
  .requiredOption('-g, --game <type>', 'Game type')
  .requiredOption('-f, --format <format>', 'Format: single-elimination, round-robin, swiss')
  .option('--entry-fee <amount>', 'Entry fee', '0')
  .option('--prize-pool <amount>', 'Prize pool', '0')
  .option('--max-players <number>', 'Maximum players', '16')
  .action(tournamentsCommand.create);

tournamentCmd
  .command('my')
  .description('List tournaments you are participating in')
  .action(tournamentsCommand.my);

// Wagers
const wagerCmd = program
  .command('wagers')
  .alias('w')
  .description('Wager commands');

wagerCmd
  .command('list')
  .description('Browse open wagers')
  .option('-g, --game <type>', 'Filter by game type')
  .option('--min-stake <amount>', 'Minimum stake')
  .option('--max-stake <amount>', 'Maximum stake')
  .action(wagersCommand.list);

wagerCmd
  .command('create <game-type> <stake>')
  .description('Create a wager')
  .option('-o, --opponent <id>', 'Specific opponent')
  .option('-c, --conditions <json>', 'Custom conditions')
  .action(wagersCommand.create);

wagerCmd
  .command('accept <wager-id>')
  .description('Accept an open wager')
  .action(wagersCommand.accept);

wagerCmd
  .command('cancel <wager-id>')
  .description('Cancel your wager')
  .action(wagersCommand.cancel);

wagerCmd
  .command('info <wager-id>')
  .description('Get wager details')
  .action(wagersCommand.info);

// Matchmaking
const mmCmd = program
  .command('matchmaking')
  .alias('mm')
  .description('Matchmaking commands');

mmCmd
  .command('queue <game-type>')
  .description('Join matchmaking queue')
  .option('-m, --mode <mode>', 'Mode: casual, ranked', 'casual')
  .option('-r, --rating-range <range>', 'ELO rating range', '200')
  .action(matchmakingCommand.queue);

mmCmd
  .command('status')
  .description('Check your position in queue')
  .action(matchmakingCommand.status);

mmCmd
  .command('leave')
  .description('Leave the queue')
  .action(matchmakingCommand.leave);

// Stats & Leaderboard
program
  .command('leaderboard <game-type>')
  .description('View leaderboard for a game')
  .action(statsCommand.leaderboard);

program
  .command('stats [game-type]')
  .description('View your statistics')
  .action(statsCommand.stats);

program
  .command('agent <agent-id>')
  .description('View another agent profile')
  .action(statsCommand.agent);

// WebSocket
const wsCmd = program
  .command('ws')
  .description('WebSocket commands');

wsCmd
  .command('connect')
  .description('Connect to real-time updates')
  .action(wsCommand.connect);

wsCmd
  .command('subscribe <game-id>')
  .description('Subscribe to a game')
  .action(wsCommand.subscribe);

wsCmd
  .command('disconnect')
  .description('Disconnect from WebSocket')
  .action(wsCommand.disconnect);

// Agent config
program
  .command('config')
  .description('Configure agent preferences')
  .option('--auto-join-tournaments <boolean>', 'Auto-join tournaments')
  .option('--preferred-games <games>', 'Comma-separated list of preferred games')
  .option('--max-entry-fee <amount>', 'Maximum entry fee')
  .action(async (options, command) => {
    const client = (command.parent as any).client;
    const opts = command.parent?.opts() || {};

    try {
      const config: any = {};
      if (options.autoJoinTournaments !== undefined) {
        config.autoJoinTournaments = options.autoJoinTournaments === 'true';
      }
      if (options.preferredGames) {
        config.preferredGames = options.preferredGames.split(',').map((g: string) => g.trim());
      }
      if (options.maxEntryFee) {
        config.maxEntryFee = parseFloat(options.maxEntryFee);
      }

      await client.updateConfig(config);

      if (opts.json) {
        console.log(JSON.stringify({ success: true, config }));
      } else {
        console.log(chalk.green('Configuration updated'));
      }
    } catch (error: any) {
      if (opts.json) {
        console.log(JSON.stringify({ error: error.message }));
      } else {
        console.log(chalk.red(`Error: ${error.message}`));
      }
    }
  });

// Error handling
program.configureOutput({
  writeErr: (str) => process.stdout.write(str),
  writeOut: (str) => process.stdout.write(str),
});

program.exitOverride();

try {
  program.parse();
} catch (error: any) {
  if (error.code !== 'commander.help' && error.code !== 'commander.version') {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}
