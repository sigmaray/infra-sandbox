import { execFileSync } from 'node:child_process';
import path from 'node:path';

const goBlogPort =
  process.env.SKIP_DOCKER_SETUP === '1'
    ? (process.env.GO_BLOG_HTTP_PORT ?? '8083')
    : (process.env.GO_BLOG_HTTP_PORT ?? '18083');

const baseURL = `http://127.0.0.1:${goBlogPort}`;

async function waitForServer(timeoutMs = 120_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseURL, { redirect: 'follow' });
      if (response.ok) {
        return true;
      }
    } catch {
      // Server not ready yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return false;
}

export default async function globalSetup() {
  if (process.env.SKIP_DOCKER_SETUP === '1') {
    console.log('[go-blog setup] SKIP_DOCKER_SETUP=1, waiting for existing server');
    if (!(await waitForServer())) {
      throw new Error(`go-blog is not reachable at ${baseURL}`);
    }
    return;
  }

  if (await waitForServer(3_000)) {
    console.log(`[go-blog setup] Server already running at ${baseURL}`);
    return;
  }

  const projectRoot = path.resolve(__dirname, '..');
  const composeFile = path.join(projectRoot, 'docker-compose.test.yml');

  console.log('[go-blog setup] Starting test stack with Docker Compose...');
  execFileSync(
    'docker',
    ['compose', '-f', composeFile, 'up', '-d', '--build', '--wait'],
    {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        GO_BLOG_HTTP_PORT: goBlogPort,
      },
    },
  );

  if (!(await waitForServer())) {
    throw new Error(`go-blog test stack failed to become ready at ${baseURL}`);
  }

  execFileSync(
    'docker',
    ['compose', '-f', composeFile, 'exec', '-T', 'app', './blog', 'users-seed'],
    {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        GO_BLOG_HTTP_PORT: goBlogPort,
      },
    },
  );

  console.log(`[go-blog setup] Test stack ready at ${baseURL}`);
}
