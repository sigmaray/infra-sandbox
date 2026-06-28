import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { readFeedManifest } from './helpers/feed-manifest';

const proxyPort = process.env.HTTP_PROXY_PORT ?? '3128';
const socksPort = process.env.SOCKS_PROXY_PORT ?? '1080';
const proxyUser = process.env.HTTP_PROXY_USER ?? 'test-proxy-user';
const proxyPassword = process.env.HTTP_PROXY_PASSWORD ?? 'test-proxy-password';
const proxyUrl = `http://${proxyUser}:${proxyPassword}@127.0.0.1:${proxyPort}`;
const proxyUrlNoAuth = `http://127.0.0.1:${proxyPort}`;
const socksUrl = `${proxyUser}:${proxyPassword}@127.0.0.1:${socksPort}`;
const socksUrlNoAuth = `127.0.0.1:${socksPort}`;

test.describe('HTTP proxy (3proxy)', () => {
  test('container is running', () => {
    const status = execFileSync(
      'docker',
      ['inspect', '--format', '{{.State.Status}}', 'http-proxy'],
      { encoding: 'utf8' },
    ).trim();

    expect(status).toBe('running');
  });

  test('rejects unauthenticated requests', () => {
    const manifest = readFeedManifest();
    const targetUrl = manifest.feeds[0]?.feedUrl;
    expect(targetUrl).toBeTruthy();

    const code = execFileSync(
      'curl',
      ['-s', '-o', '/dev/null', '-w', '%{http_code}', '-x', proxyUrlNoAuth, targetUrl!],
      { encoding: 'utf8' },
    ).trim();

    expect(code).toBe('407');
  });

  test('forwards authenticated HTTP requests', () => {
    const manifest = readFeedManifest();
    const feed = manifest.feeds[0];
    expect(feed).toBeTruthy();

    const body = execFileSync(
      'curl',
      ['-sf', '-x', proxyUrl, feed!.feedUrl],
      { encoding: 'utf8', timeout: 30_000 },
    );

    expect(body).toContain('<rss version="2.0">');
    expect(body).toContain(`<title>${feed!.channelTitle}</title>`);
  });
});

test.describe('SOCKS proxy (3proxy)', () => {
  test('rejects unauthenticated requests', () => {
    const manifest = readFeedManifest();
    const targetUrl = manifest.feeds[0]?.feedUrl;
    expect(targetUrl).toBeTruthy();

    expect(() =>
      execFileSync(
        'curl',
        ['-sf', '--socks5-hostname', socksUrlNoAuth, targetUrl!],
        { encoding: 'utf8', timeout: 15_000 },
      ),
    ).toThrow();
  });

  test('forwards authenticated SOCKS requests', () => {
    const manifest = readFeedManifest();
    const feed = manifest.feeds[0];
    expect(feed).toBeTruthy();

    const body = execFileSync(
      'curl',
      ['-sf', '--socks5-hostname', socksUrl, feed!.feedUrl],
      { encoding: 'utf8', timeout: 30_000 },
    );

    expect(body).toContain('<rss version="2.0">');
    expect(body).toContain(`<title>${feed!.channelTitle}</title>`);
  });
});
