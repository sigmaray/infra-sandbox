import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

const minioBucket = process.env.MINIO_BUCKET ?? 'pg-backups';

test.describe('PostgreSQL backups to S3', () => {
  test('pg-backup container is running', () => {
    const status = execFileSync(
      'docker',
      ['inspect', '--format', '{{.State.Status}}', 'pg-backup'],
      { encoding: 'utf8' },
    ).trim();

    expect(status).toBe('running');
  });

  test('backup script uploads PostgreSQL dump to S3', () => {
    execFileSync('docker', ['exec', 'pg-backup', '/backup.sh'], {
      encoding: 'utf8',
      timeout: 120_000,
    });

    const listing = execFileSync(
      'docker',
      ['exec', 'pg-backup', 'mc', 'ls', `backup-minio/${minioBucket}/daily/`],
      { encoding: 'utf8', timeout: 30_000 },
    );

    expect(listing).toMatch(/\.sql\.gz/);
  });

  test('backup archive contains application databases', () => {
    const latestObject = execFileSync(
      'docker',
      [
        'exec',
        'pg-backup',
        'sh',
        '-c',
        `mc ls backup-minio/${minioBucket}/daily/ | awk '{print $NF}' | sort | tail -1`,
      ],
      { encoding: 'utf8', timeout: 30_000 },
    ).trim();

    expect(latestObject).toMatch(/\.sql\.gz$/);

    const sqlSnippet = execFileSync(
      'docker',
      [
        'exec',
        'pg-backup',
        'sh',
        '-c',
        `mc cat backup-minio/${minioBucket}/daily/${latestObject} | gunzip | head -n 200`,
      ],
      { encoding: 'utf8', timeout: 120_000 },
    );

    expect(sqlSnippet).toContain('freshrss');
    expect(sqlSnippet).toContain('goblog');
  });

  test('daily backup cron is configured', () => {
    const crontab = execFileSync(
      'docker',
      ['exec', 'pg-backup', 'cat', '/etc/crontabs/root'],
      { encoding: 'utf8' },
    );

    expect(crontab).toMatch(/^0 2 \* \* \* \/backup\.sh/m);
  });
});
