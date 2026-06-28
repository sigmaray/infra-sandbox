import { execFileSync } from 'node:child_process';
import path from 'node:path';

export default async function globalTeardown() {
  if (process.env.SKIP_DOCKER_SETUP === '1' || process.env.KEEP_STACK === '1') {
    console.log('[go-blog teardown] Keeping stack running');
    return;
  }

  const projectRoot = path.resolve(__dirname, '..');
  const composeFile = path.join(projectRoot, 'docker-compose.test.yml');

  console.log('[go-blog teardown] Stopping test stack...');
  execFileSync('docker', ['compose', '-f', composeFile, 'down', '--volumes'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  });
}
