import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

const wgEasyWebPort = process.env.WG_EASY_WEB_PORT ?? '51821';
const wgEasyUrl = `http://127.0.0.1:${wgEasyWebPort}`;
const adminPassword = 'test-wg-easy-password';

test.describe('WireGuard (wg-easy)', () => {
  test('container is running', () => {
    const status = execFileSync(
      'docker',
      ['inspect', '--format', '{{.State.Status}}', 'wg-easy'],
      { encoding: 'utf8' },
    ).trim();

    expect(status).toBe('running');
  });

  test('web UI responds', async ({ request }) => {
    const response = await request.get(`${wgEasyUrl}/`);
    expect(response.ok()).toBeTruthy();
  });

  test('admin can authenticate via API', async ({ request }) => {
    const response = await request.post(`${wgEasyUrl}/api/session`, {
      data: { password: adminPassword },
    });

    expect(response.ok()).toBeTruthy();
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  test('wireguard interface is configured', () => {
    const wgOutput = execFileSync('docker', ['exec', 'wg-easy', 'wg', 'show'], {
      encoding: 'utf8',
      timeout: 30_000,
    });

    expect(wgOutput).toContain('interface: wg0');
    expect(wgOutput).toMatch(/listening port: \d+/);
  });

  test('persists config in the local data directory', () => {
    const dataDir = execFileSync(
      'docker',
      [
        'inspect',
        '--format',
        '{{range .Mounts}}{{if eq .Destination "/etc/wireguard"}}{{.Source}}{{end}}{{end}}',
        'wg-easy',
      ],
      { encoding: 'utf8' },
    ).trim();

    expect(dataDir).toContain('wg-easy/data');
    execFileSync('test', ['-d', dataDir]);
  });
});
