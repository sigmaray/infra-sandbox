import { execFileSync } from 'node:child_process';
import path from 'node:path';

export default async function globalTeardown() {
  if (process.env.KEEP_STACK === '1' || process.env.SKIP_STACK_SETUP === '1') {
    console.log('[global-teardown] Keeping stack running');
    return;
  }

  const repoRoot = path.resolve(__dirname, '..');
  const stackDown = path.join(repoRoot, 'scripts', 'stack-down.sh');

  console.log('[global-teardown] Stopping Docker stack...');
  execFileSync('bash', [stackDown], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      REPO_DIR: repoRoot,
    },
  });
}
