import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_PATH = process.env.VERSUS_CONFIG_PATH || join(homedir(), '.versus', 'config.json');

export interface Config {
  apiKey?: string;
  apiUrl?: string;
  wsUrl?: string;
  walletAddress?: string;
  agentId?: string;
  preferences?: {
    autoJoinTournaments?: boolean;
    preferredGames?: string[];
    maxEntryFee?: number;
  };
}

export async function loadConfig(): Promise<Config> {
  try {
    if (existsSync(CONFIG_PATH)) {
      const data = await readFile(CONFIG_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
  return {};
}

export async function saveConfig(config: Config): Promise<void> {
  try {
    const dir = CONFIG_PATH.substring(0, CONFIG_PATH.lastIndexOf('/'));
    await import('fs/promises').then(fs => fs.mkdir(dir, { recursive: true }));
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Error saving config:', error);
    throw error;
  }
}
