import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const contentDir = path.join(repoRoot, 'static-server', 'content');
const feedsDir = path.join(contentDir, 'feeds');
const manifestPath = path.join(contentDir, 'manifest.json');

const adjectives = [
  'Quantum',
  'Velvet',
  'Crimson',
  'Silent',
  'Luminous',
  'Arctic',
  'Hidden',
  'Rapid',
  'Golden',
  'Neon',
];

const nouns = [
  'Horizon',
  'Circuit',
  'Harbor',
  'Echo',
  'Garden',
  'Signal',
  'Summit',
  'Mirror',
  'Voyage',
  'Atlas',
];

function pick<T>(items: T[]): T {
  return items[randomBytes(1)[0] % items.length];
}

function randomTitle(): string {
  return `${pick(adjectives)} ${pick(nouns)} ${randomBytes(2).toString('hex')}`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function formatRfc822(date: Date): string {
  return date.toUTCString().replace('GMT', '+0000');
}

type FeedArticle = {
  guid: string;
  title: string;
  link: string;
  pubDate: string;
  description: string;
};

type FeedManifest = {
  generatedAt: string;
  feeds: Array<{
    fileName: string;
    channelTitle: string;
    feedUrl: string;
    hostFeedUrl: string;
    articles: FeedArticle[];
  }>;
};

function buildRss(channelTitle: string, articles: FeedArticle[]): string {
  const items = articles
    .map(
      (article) => `    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${escapeXml(article.link)}</link>
      <guid isPermaLink="false">${escapeXml(article.guid)}</guid>
      <pubDate>${escapeXml(article.pubDate)}</pubDate>
      <description>${escapeXml(article.description)}</description>
    </item>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(channelTitle)}</title>
    <link>http://static-server/</link>
    <description>Generated test RSS feed for infra-sandbox</description>
    <language>en</language>
    <lastBuildDate>${escapeXml(formatRfc822(new Date()))}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

function main() {
  fs.mkdirSync(feedsDir, { recursive: true });

  const feedCount = 2;
  const articlesPerFeed = 3;
  const manifest: FeedManifest = {
    generatedAt: new Date().toISOString(),
    feeds: [],
  };

  for (let feedIndex = 0; feedIndex < feedCount; feedIndex += 1) {
    const fileName = `test-feed-${feedIndex + 1}.xml`;
    const channelTitle = `Sandbox Feed ${randomUUID()}`;
    const articles: FeedArticle[] = [];

    for (let articleIndex = 0; articleIndex < articlesPerFeed; articleIndex += 1) {
      const guid = randomUUID();
      const title = randomTitle();
      const publishedAt = new Date(Date.now() - (articleIndex + 1) * 3_600_000);

      articles.push({
        guid,
        title,
        link: `http://static-server/articles/${guid}`,
        pubDate: formatRfc822(publishedAt),
        description: `Generated article body for ${title}`,
      });
    }

    const filePath = path.join(feedsDir, fileName);
    fs.writeFileSync(filePath, buildRss(channelTitle, articles), 'utf8');

    manifest.feeds.push({
      fileName,
      channelTitle,
      feedUrl: `http://static-server/feeds/${fileName}`,
      hostFeedUrl: `http://127.0.0.1:${process.env.STATIC_SERVER_HTTP_PORT ?? '8082'}/feeds/${fileName}`,
      articles,
    });
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`[generate-test-feeds] Wrote ${manifest.feeds.length} feeds to ${feedsDir}`);
}

main();
