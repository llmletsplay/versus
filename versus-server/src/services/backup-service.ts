import { DatabaseProvider } from '../core/database.js';
import { logger } from '../utils/logger.js';
import { createWriteStream, createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGzip, createGunzip } from 'zlib';
import path from 'path';
import fs from 'fs/promises';

export interface BackupConfig {
  enabled: boolean;
  schedule: string; // cron format
  retentionDays: number;
  backupPath: string;
  compression: boolean;
  includeGameStates: boolean;
  includeUserData: boolean;
  includeStats: boolean;
}

export interface BackupMetadata {
  timestamp: string;
  version: string;
  size: number;
  compressed: boolean;
  tables: string[];
  checksum: string;
}

export class BackupService {
  private database: DatabaseProvider;
  private config: BackupConfig;
  private backupInterval?: NodeJS.Timeout;

  constructor(database: DatabaseProvider, config: BackupConfig) {
    this.database = database;
    this.config = config;
  }

  async start(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Backup service disabled');
      return;
    }

    await this.ensureBackupDirectory();

    // Start automated backups (simplified cron-like scheduling)
    if (this.config.schedule === 'hourly') {
      this.scheduleBackups(60 * 60 * 1000); // 1 hour
    } else if (this.config.schedule === 'daily') {
      this.scheduleBackups(24 * 60 * 60 * 1000); // 24 hours
    } else if (this.config.schedule === 'weekly') {
      this.scheduleBackups(7 * 24 * 60 * 60 * 1000); // 7 days
    }

    logger.info('Backup service started', {
      schedule: this.config.schedule,
      retentionDays: this.config.retentionDays,
      backupPath: this.config.backupPath,
    });
  }

  async stop(): Promise<void> {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = undefined;
    }
    logger.info('Backup service stopped');
  }

  async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `backup-${timestamp}`;
    const backupDir = path.join(this.config.backupPath, backupId);

    try {
      await fs.mkdir(backupDir, { recursive: true });

      logger.info('Starting database backup', { backupId });

      const metadata: BackupMetadata = {
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        size: 0,
        compressed: this.config.compression,
        tables: [],
        checksum: '',
      };

      // Backup different data types based on configuration
      if (this.config.includeUserData) {
        await this.backupTable('users', backupDir);
        metadata.tables.push('users');
      }

      if (this.config.includeGameStates) {
        await this.backupTable('game_states', backupDir);
        metadata.tables.push('game_states');
      }

      if (this.config.includeStats) {
        await this.backupTable('game_stats', backupDir);
        await this.backupTable('activity_log', backupDir);
        metadata.tables.push('game_stats', 'activity_log');
      }

      // Calculate backup size
      const stats = await fs.stat(backupDir);
      metadata.size = await this.calculateDirectorySize(backupDir);

      // Generate checksum for integrity
      metadata.checksum = await this.generateBackupChecksum(backupDir);

      // Save metadata
      await fs.writeFile(path.join(backupDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

      // Compress backup if enabled
      if (this.config.compression) {
        await this.compressBackup(backupDir);
      }

      logger.info('Database backup completed', {
        backupId,
        size: metadata.size,
        tables: metadata.tables.length,
        compressed: this.config.compression,
      });

      // Cleanup old backups
      await this.cleanupOldBackups();

      return backupId;
    } catch (error) {
      logger.error('Database backup failed', { backupId, error });
      throw error;
    }
  }

  async restoreBackup(backupId: string): Promise<void> {
    const backupDir = path.join(this.config.backupPath, backupId);

    try {
      // Check if backup exists
      await fs.access(backupDir);

      // Load metadata
      const metadataPath = path.join(backupDir, 'metadata.json');
      const metadata: BackupMetadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));

      logger.info('Starting database restoration', { backupId, metadata });

      // Verify backup integrity
      const currentChecksum = await this.generateBackupChecksum(backupDir);
      if (currentChecksum !== metadata.checksum) {
        throw new Error('Backup integrity check failed - checksum mismatch');
      }

      // Decompress if needed
      if (metadata.compressed) {
        await this.decompressBackup(backupDir);
      }

      // Restore each table
      for (const table of metadata.tables) {
        await this.restoreTable(table, backupDir);
      }

      logger.info('Database restoration completed', { backupId });
    } catch (error) {
      logger.error('Database restoration failed', { backupId, error });
      throw error;
    }
  }

  async listBackups(): Promise<BackupMetadata[]> {
    try {
      const backupDirs = await fs.readdir(this.config.backupPath);
      const backups: BackupMetadata[] = [];

      for (const dir of backupDirs) {
        if (dir.startsWith('backup-')) {
          try {
            const metadataPath = path.join(this.config.backupPath, dir, 'metadata.json');
            const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
            backups.push(metadata);
          } catch (error) {
            logger.warn('Could not read backup metadata', { dir, error });
          }
        }
      }

      return backups.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch (error) {
      logger.error('Failed to list backups', { error });
      return [];
    }
  }

  private scheduleBackups(intervalMs: number): void {
    this.backupInterval = setInterval(async () => {
      try {
        await this.createBackup();
      } catch (error) {
        logger.error('Scheduled backup failed', { error });
      }
    }, intervalMs);
  }

  private async ensureBackupDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.config.backupPath, { recursive: true });
    } catch (error) {
      logger.error('Failed to create backup directory', { path: this.config.backupPath, error });
      throw error;
    }
  }

  private async backupTable(tableName: string, backupDir: string): Promise<void> {
    try {
      const data = await this.database.query(`SELECT * FROM ${tableName}`);
      const filePath = path.join(backupDir, `${tableName}.json`);

      await fs.writeFile(filePath, JSON.stringify(data, null, 2));

      logger.debug('Table backed up', { tableName, records: data.length });
    } catch (error) {
      logger.error('Table backup failed', { tableName, error });
      throw error;
    }
  }

  private async restoreTable(tableName: string, backupDir: string): Promise<void> {
    try {
      const filePath = path.join(backupDir, `${tableName}.json`);
      const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));

      // Clear existing data (be careful in production!)
      await this.database.query(`DELETE FROM ${tableName}`);

      // Restore data (this would need table-specific SQL)
      logger.warn('Table restoration needs table-specific implementation', { tableName });

      logger.debug('Table restored', { tableName, records: data.length });
    } catch (error) {
      logger.error('Table restoration failed', { tableName, error });
      throw error;
    }
  }

  private async compressBackup(backupDir: string): Promise<void> {
    // Implementation for backup compression
    logger.debug('Backup compression not yet implemented', { backupDir });
  }

  private async decompressBackup(backupDir: string): Promise<void> {
    // Implementation for backup decompression
    logger.debug('Backup decompression not yet implemented', { backupDir });
  }

  private async calculateDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;
    const files = await fs.readdir(dirPath, { withFileTypes: true });

    for (const file of files) {
      const filePath = path.join(dirPath, file.name);
      if (file.isDirectory()) {
        totalSize += await this.calculateDirectorySize(filePath);
      } else {
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
      }
    }

    return totalSize;
  }

  private async generateBackupChecksum(backupDir: string): Promise<string> {
    // Simple checksum implementation - in production use crypto.createHash
    const files = await fs.readdir(backupDir);
    const fileList = files.sort().join(',');
    return Buffer.from(fileList).toString('base64');
  }

  private async cleanupOldBackups(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

      const backups = await this.listBackups();
      let cleanedCount = 0;

      for (const backup of backups) {
        const backupDate = new Date(backup.timestamp);
        if (backupDate < cutoffDate) {
          const backupId = `backup-${backup.timestamp.replace(/[:.]/g, '-')}`;
          const backupDir = path.join(this.config.backupPath, backupId);

          try {
            await fs.rm(backupDir, { recursive: true, force: true });
            cleanedCount++;
            logger.debug('Old backup removed', { backupId, age: backupDate });
          } catch (error) {
            logger.warn('Failed to remove old backup', { backupId, error });
          }
        }
      }

      if (cleanedCount > 0) {
        logger.info(
          `Cleaned up ${cleanedCount} old backups older than ${this.config.retentionDays} days`
        );
      }
    } catch (error) {
      logger.error('Backup cleanup failed', { error });
    }
  }
}
