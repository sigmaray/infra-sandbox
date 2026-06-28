import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

const s3ApiPort = process.env.MINIO_API_PORT ?? '9002';
const minioBucket = process.env.MINIO_BUCKET ?? 'pg-backups';
const s3HealthUrl = `http://127.0.0.1:${s3ApiPort}/minio/health/live`;

test.describe('S3 storage (MinIO)', () => {
  test('container is running', () => {
    const status = execFileSync(
      'docker',
      ['inspect', '--format', '{{.State.Status}}', 's3-storage'],
      { encoding: 'utf8' },
    ).trim();

    expect(status).toBe('running');
  });

  test('health endpoint responds', () => {
    execFileSync('curl', ['-sf', s3HealthUrl], { encoding: 'utf8', timeout: 30_000 });
  });

  test('stores data in the local data directory', () => {
    const dataDir = execFileSync(
      'docker',
      ['inspect', '--format', '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}', 's3-storage'],
      { encoding: 'utf8' },
    ).trim();

    expect(dataDir).toContain('s3-storage/data');
    execFileSync('test', ['-d', dataDir]);
  });

  test('can upload and list objects via S3 API', () => {
    const testKey = `test/s3-storage-spec-${Date.now()}.txt`;
    const testContent = `s3-storage-test-${Date.now()}`;

    execFileSync(
      'docker',
      [
        'exec',
        'pg-backup',
        'sh',
        '-c',
        `printf '%s' '${testContent}' > /tmp/s3-test.txt && mc cp /tmp/s3-test.txt backup-minio/${minioBucket}/${testKey}`,
      ],
      { encoding: 'utf8', timeout: 60_000 },
    );

    const listing = execFileSync(
      'docker',
      ['exec', 'pg-backup', 'mc', 'ls', `backup-minio/${minioBucket}/test/`],
      { encoding: 'utf8', timeout: 30_000 },
    );

    expect(listing).toContain('s3-storage-spec-');

    const objectBody = execFileSync(
      'docker',
      ['exec', 'pg-backup', 'mc', 'cat', `backup-minio/${minioBucket}/${testKey}`],
      { encoding: 'utf8', timeout: 30_000 },
    );

    expect(objectBody).toBe(testContent);
  });
});
