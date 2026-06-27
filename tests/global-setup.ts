import { execFileSync } from 'node:child_process';
import path from 'node:path';

export default async function globalSetup() {
  const repoRoot = path.resolve(__dirname, '..');
  const stackUp = path.join(repoRoot, 'scripts', 'stack-up.sh');

  if (process.env.SKIP_STACK_SETUP === '1') {
    console.log('[global-setup] SKIP_STACK_SETUP=1, assuming stack is already running');
    return;
  }

  console.log('[global-setup] Starting Docker stack...');
  execFileSync('bash', [stackUp], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      REPO_DIR: repoRoot,
    },
  });
}
