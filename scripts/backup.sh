#!/bin/bash
# Production Database Backup Script
# Designed to run daily via cron

set -euo pipefail

# Configuration
DB_HOST="${POSTGRES_HOST:-postgres}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-versus_db}"
DB_USER="${POSTGRES_USER:-versus_user}"
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="versus_backup_${DATE}.sql"
COMPRESSED_FILE="${BACKUP_FILE}.gz"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# Log file
LOG_FILE="${BACKUP_DIR}/backup.log"
exec > >(tee -a "${LOG_FILE}")
exec 2>&1

echo "===== Backup Started at $(date) ====="

# Pre-backup checks
echo "Checking database connection..."
if ! pg_isready -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}"; then
    echo "ERROR: Database is not ready"
    exit 1
fi

# Create backup
echo "Creating database backup: ${BACKUP_FILE}"
if ! PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    -F plain \
    --no-owner \
    --no-privileges \
    --verbose \
    --file="${BACKUP_DIR}/${BACKUP_FILE}"; then
    echo "ERROR: Backup failed"
    exit 1
fi

# Compress backup
echo "Compressing backup..."
if ! gzip "${BACKUP_DIR}/${BACKUP_FILE}"; then
    echo "ERROR: Compression failed"
    exit 1
fi

# Calculate checksum
echo "Calculating checksum..."
cd "${BACKUP_DIR}"
if ! sha256sum "${COMPRESSED_FILE}" > "${COMPRESSED_FILE}.sha256"; then
    echo "ERROR: Checksum calculation failed"
    exit 1
fi

# Get file size
FILE_SIZE=$(du -h "${COMPRESSED_FILE}" | cut -f1)

echo "Backup completed successfully:"
echo "  File: ${COMPRESSED_FILE}"
echo "  Size: ${FILE_SIZE}"
echo "  Location: ${BACKUP_DIR}"

# Cleanup old backups
echo "Cleaning up backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "versus_backup_*.sql.gz" -type f -mtime +${RETENTION_DAYS} -delete
find "${BACKUP_DIR}" -name "versus_backup_*.sql.gz.sha256" -type f -mtime +${RETENTION_DAYS} -delete

# List remaining backups
echo "Current backups:"
ls -lh "${BACKUP_DIR}"/versus_backup_*.sql.gz | awk '{print $9, $5}'

# Verify backup integrity (optional)
if command -v zgrep &> /dev/null; then
    echo "Verifying backup integrity..."
    if zgrep -q "PostgreSQL database dump" "${COMPRESSED_FILE}"; then
        echo "Backup verification: PASSED"
    else
        echo "WARNING: Backup verification: FAILED - file may be corrupted"
    fi
fi

echo "===== Backup Completed at $(date) ====="
echo ""