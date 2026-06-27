import fs from 'node:fs';
import path from 'node:path';

const manifestPath = process.env.STATIC_SERVER_CONTENT_DIR
  ? path.join(process.env.STATIC_SERVER_CONTENT_DIR, 'manifest.json')
  : path.resolve(__dirname, '../../static-server/content/manifest.json');

export type FeedManifest = {
  feeds: Array<{
    fileName: string;
    channelTitle: string;
    feedUrl: string;
    hostFeedUrl: string;
    articles: Array<{
      title: string;
    }>;
  }>;
};

export function readFeedManifest(): FeedManifest {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as FeedManifest;
}
