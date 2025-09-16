#!/usr/bin/env bun

import {
  BackupService,
  type BackupConfig,
} from "../versus-server/src/services/backup-service.js";
import {
  createDatabaseProvider,
  type DatabaseConfig,
} from "../versus-server/src/core/database.js";
import { logger } from "../versus-server/src/utils/logger.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const GAME_DATA_PATH = process.env.GAME_DATA_PATH || "./game_data";

// Database configuration
const databaseConfig: DatabaseConfig = process.env.DATABASE_URL
  ? {
      type: "postgresql",
      connectionString: process.env.DATABASE_URL,
    }
  : {
      type: "sqlite",
      sqlitePath: `${GAME_DATA_PATH}/versus.db`,
    };

// Backup configuration
const backupConfig: BackupConfig = {
  enabled: true,
  schedule: "manual",
  retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || "30"),
  backupPath: process.env.BACKUP_PATH || `${GAME_DATA_PATH}/backups`,
  compression: true,
  includeGameStates: true,
  includeUserData: true,
  includeStats: true,
};

async function main() {
  const command = process.argv[2];
  const database = createDatabaseProvider(databaseConfig);
  const backupService = new BackupService(database, backupConfig);

  try {
    await database.initialize();

    switch (command) {
      case "create":
        await createBackup(backupService);
        break;
      case "list":
        await listBackups(backupService);
        break;
      case "restore":
        const backupId = process.argv[3];
        if (!backupId) {
          console.error("❌ Backup ID required for restore command");
          console.log(
            "Usage: bun scripts/backup-manager.ts restore <backup-id>",
          );
          process.exit(1);
        }
        await restoreBackup(backupService, backupId);
        break;
      case "help":
      default:
        showHelp();
        break;
    }
  } catch (error) {
    logger.error("Backup operation failed", { error });
    console.error(
      "❌ Backup operation failed:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  } finally {
    await database.close();
  }
}

async function createBackup(backupService: BackupService): Promise<void> {
  console.log("🚀 Creating database backup...");

  const backupId = await backupService.createBackup();

  console.log("✅ Backup created successfully!");
  console.log(`📦 Backup ID: ${backupId}`);
  console.log(`📁 Location: ${backupConfig.backupPath}/${backupId}`);
}

async function listBackups(backupService: BackupService): Promise<void> {
  console.log("📋 Listing available backups...");

  const backups = await backupService.listBackups();

  if (backups.length === 0) {
    console.log("📭 No backups found");
    return;
  }

  console.log(`\n📦 Found ${backups.length} backup(s):\n`);
  console.log(
    "| Timestamp            | Version | Size    | Tables | Compressed |",
  );
  console.log(
    "|---------------------|---------|---------|---------|------------|",
  );

  backups.forEach((backup) => {
    const timestamp = new Date(backup.timestamp).toLocaleString();
    const size = formatBytes(backup.size);
    const compressed = backup.compressed ? "✅" : "❌";

    console.log(
      `| ${timestamp.padEnd(19)} | ${backup.version.padEnd(7)} | ${size.padEnd(7)} | ${backup.tables.length.toString().padEnd(7)} | ${compressed.padEnd(10)} |`,
    );
  });

  console.log(
    `\n💡 To restore a backup: bun scripts/backup-manager.ts restore <backup-id>`,
  );
}

async function restoreBackup(
  backupService: BackupService,
  backupId: string,
): Promise<void> {
  console.log(`🔄 Restoring backup: ${backupId}`);
  console.log("⚠️  WARNING: This will overwrite current database data!");

  // In a real implementation, you'd want confirmation
  console.log("⏳ Starting restoration...");

  await backupService.restoreBackup(backupId);

  console.log("✅ Backup restored successfully!");
  console.log("🔄 Please restart the server to load the restored data");
}

function showHelp(): void {
  console.log(`
🎮 Versus Game Server - Backup Manager

USAGE:
  bun scripts/backup-manager.ts <command> [options]

COMMANDS:
  create          Create a new backup
  list            List all available backups
  restore <id>    Restore a specific backup
  help            Show this help message

EXAMPLES:
  bun scripts/backup-manager.ts create
  bun scripts/backup-manager.ts list
  bun scripts/backup-manager.ts restore backup-2024-01-15T10-30-00-000Z

ENVIRONMENT VARIABLES:
  BACKUP_PATH              Backup storage directory (default: ./game_data/backups)
  BACKUP_RETENTION_DAYS    How long to keep backups (default: 30)
  DATABASE_URL             Database connection string (optional)
  GAME_DATA_PATH           Game data directory (default: ./game_data)

For more information, see the documentation.
`);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// Run the script
main().catch((error) => {
  console.error("❌ Script failed:", error);
  process.exit(1);
});
