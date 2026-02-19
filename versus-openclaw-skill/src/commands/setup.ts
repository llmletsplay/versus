import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadConfig, saveConfig } from '../config.js';

export async function setupCommand(this: any) {
  const opts = this.opts ? this.opts() : {};
  const config = await loadConfig();

  try {
    if (!opts.json) {
      console.log(chalk.cyan('🎮 Welcome to VERSUS Gaming Platform Setup'));
      console.log(chalk.gray('Let\'s configure your agent to play games and earn!\n'));
    }

    // Check if already configured
    if (config.apiKey) {
      if (!opts.json) {
        const { reconfigure } = await inquirer.prompt([{
          type: 'confirm',
          name: 'reconfigure',
          message: 'Already configured. Reconfigure?',
          default: false,
        }]);
        if (!reconfigure) {
          console.log(chalk.yellow('Setup cancelled'));
          return;
        }
      }
    }

    // API Key
    const answers: any = {};
    
    if (!opts.json) {
      const apiKeyAnswer = await inquirer.prompt([{
        type: 'input',
        name: 'apiKey',
        message: 'Enter your VERSUS API key:',
        validate: (input) => input.length > 0 || 'API key is required',
      }]);
      answers.apiKey = apiKeyAnswer.apiKey;

      const apiUrlAnswer = await inquirer.prompt([{
        type: 'input',
        name: 'apiUrl',
        message: 'API URL (leave blank for default):',
        default: config.apiUrl || 'https://api.versus.gg',
      }]);
      answers.apiUrl = apiUrlAnswer.apiUrl || 'https://api.versus.gg';

      const wsUrlAnswer = await inquirer.prompt([{
        type: 'input',
        name: 'wsUrl',
        message: 'WebSocket URL (leave blank for default):',
        default: config.wsUrl || 'wss://ws.versus.gg',
      }]);
      answers.wsUrl = wsUrlAnswer.wsUrl || 'wss://ws.versus.gg';

      // Preferences
      console.log(chalk.cyan('\nAgent Preferences:'));
      
      const prefs: any = {};
      
      const autoJoinAnswer = await inquirer.prompt([{
        type: 'confirm',
        name: 'autoJoin',
        message: 'Auto-join tournaments?',
        default: config.preferences?.autoJoinTournaments || false,
      }]);
      prefs.autoJoinTournaments = autoJoinAnswer.autoJoin;

      const gamesAnswer = await inquirer.prompt([{
        type: 'input',
        name: 'games',
        message: 'Preferred games (comma-separated, e.g., chess,tic-tac-toe):',
        default: config.preferences?.preferredGames?.join(',') || '',
      }]);
      prefs.preferredGames = gamesAnswer.games.split(',').map((g: string) => g.trim()).filter(Boolean);

      const feeAnswer = await inquirer.prompt([{
        type: 'number',
        name: 'maxFee',
        message: 'Maximum tournament entry fee (USDC):',
        default: config.preferences?.maxEntryFee || 10,
      }]);
      prefs.maxEntryFee = feeAnswer.maxFee;

      answers.preferences = prefs;
    } else {
      // Non-interactive mode
      console.log(JSON.stringify({
        error: 'Interactive mode required for setup',
        message: 'Use non-interactive commands: versus login, versus config',
      }));
      process.exit(1);
    }

    // Save config
    const newConfig = {
      ...config,
      apiKey: answers.apiKey,
      apiUrl: answers.apiUrl,
      wsUrl: answers.wsUrl,
      preferences: answers.preferences,
    };

    await saveConfig(newConfig);

    if (opts.json) {
      console.log(JSON.stringify({ success: true, message: 'Setup complete' }));
    } else {
      console.log(chalk.green('\n✓ Setup complete!'));
      console.log(chalk.gray('Your agent is now configured and ready to play.'));
      console.log(chalk.gray('Run "versus games list" to see available games.'));
    }
  } catch (error: any) {
    if (opts.json) {
      console.log(JSON.stringify({ error: error.message }));
    } else {
      console.log(chalk.red(`Error: ${error.message}`));
    }
    process.exit(1);
  }
}
