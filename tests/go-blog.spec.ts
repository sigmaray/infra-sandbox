import { expect, test, type Page } from '@playwright/test';

const goBlogPort = process.env.GO_BLOG_HTTP_PORT ?? '8083';
const goBlogUrl = `http://127.0.0.1:${goBlogPort}`;

function uniqueId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function loginToGoBlog(page: Page) {
  await page.goto(`${goBlogUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('admin');
  await page.getByRole('button', { name: /login/i }).click();
  await expect(page).toHaveURL(/\/admin/);
}

async function createPost(
  page: Page,
  opts: { title?: string; content: string; tags?: string },
) {
  await page.goto(`${goBlogUrl}/admin/posts/new`, { waitUntil: 'domcontentloaded' });

  if (opts.title) {
    await page.locator('#title').fill(opts.title);
  }
  await page.locator('#content').fill(opts.content);
  if (opts.tags) {
    await page.locator('#tags').fill(opts.tags);
  }

  await page.getByRole('button', { name: /create post/i }).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
}

test.describe('go-blog', () => {
  test('serves the homepage', async ({ page }) => {
    const response = await page.goto(`${goBlogUrl}/`, { waitUntil: 'domcontentloaded' });

    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/Go Blog/i);
    await expect(page.locator('body')).toContainText(/Go Blog/i);
  });

  test('admin login page is available', async ({ page }) => {
    await page.goto(`${goBlogUrl}/login`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: /login/i })).toBeVisible();
  });

  test('admin can log in', async ({ page }) => {
    await loginToGoBlog(page);
    await expect(page.locator('body')).toContainText(/Dashboard|Logout/i);
  });

  test.describe.serial('posts', () => {
    test('paginates posts across pages', async ({ page }) => {
      await loginToGoBlog(page);
      const paginationTag = uniqueId('e2e-pagination');

      for (let i = 1; i <= 6; i++) {
        await createPost(page, {
          title: `${paginationTag} Pagination Post ${i}`,
          content: `Pagination content ${i}`,
          tags: paginationTag,
        });
      }

      await page.goto(`${goBlogUrl}/?tag=${paginationTag}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.post')).toHaveCount(5);
      await expect(page.getByRole('link', { name: 'Next' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Previous' })).not.toBeVisible();

      await page.getByRole('link', { name: 'Next' }).click();
      await expect(page).toHaveURL(new RegExp(`[?&]page=2(?:&|$).*tag=${paginationTag}|[?&]tag=${paginationTag}(?:&|$).*page=2`));
      await expect(page.locator('.post')).toHaveCount(1);
      await expect(page.getByRole('link', { name: 'Previous' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Next' })).not.toBeVisible();

      await page.getByRole('link', { name: 'Previous' }).click();
      await expect(page.locator('.post')).toHaveCount(5);
    });

    test('validates required content on create', async ({ page }) => {
      await loginToGoBlog(page);
      await page.goto(`${goBlogUrl}/admin/posts/new`, { waitUntil: 'domcontentloaded' });

      await page.locator('#title').fill('Title without content');
      await page.locator('#content').fill('');
      await page.locator('#content').evaluate((field) => field.removeAttribute('required'));
      await page.getByRole('button', { name: /create post/i }).click();

      await expect(page.locator('.error')).toContainText('Content is required');
      await expect(page).toHaveURL(/\/admin\/posts$/);
      await expect(page.getByRole('heading', { name: 'Create New Post' })).toBeVisible();
    });

    test('creates a post with title, content, and tags', async ({ page }) => {
      await loginToGoBlog(page);
      const title = uniqueId('feature-post');
      const firstTag = uniqueId('go');
      const secondTag = uniqueId('tutorial');
      await createPost(page, {
        title,
        content: 'Feature post body',
        tags: `${firstTag}, ${secondTag}`,
      });

      await expect(page.locator('body')).toContainText(title);

      await page.goto(`${goBlogUrl}/?tag=${firstTag}`, { waitUntil: 'domcontentloaded' });
      const post = page.locator('.post').filter({ hasText: title });
      await expect(post).toBeVisible();
      await expect(post.locator('.post-content')).toContainText('Feature post body');
      await expect(post.getByRole('link', { name: firstTag })).toBeVisible();
      await expect(post.getByRole('link', { name: secondTag })).toBeVisible();
    });

    test('filters posts by tag', async ({ page }) => {
      await loginToGoBlog(page);
      const tagGo = uniqueId('e2e-go');
      const tagWeb = uniqueId('e2e-web');
      const goTitle = uniqueId('go-tagged-post');
      const webTitle = uniqueId('web-tagged-post');
      await createPost(page, {
        title: goTitle,
        content: 'Content for go tag',
        tags: tagGo,
      });
      await createPost(page, {
        title: webTitle,
        content: 'Content for web tag',
        tags: tagWeb,
      });

      await page.goto(`${goBlogUrl}/?tag=${tagGo}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toContainText(`Showing posts for tag: ${tagGo}`);
      await expect(page.locator('.post')).toHaveCount(1);
      await expect(page.locator('.post')).toContainText(goTitle);
      await expect(page.locator('.post')).not.toContainText(webTitle);

      await page.getByRole('link', { name: 'Clear filter' }).click();
      await expect(page.locator('body')).not.toContainText('Showing posts for tag:');
      await expect(page.locator('.post').filter({ hasText: goTitle })).toBeVisible();
      await expect(page.locator('.post').filter({ hasText: webTitle })).toBeVisible();

      const goPost = page.locator('.post').filter({ hasText: goTitle });
      await goPost.getByRole('link', { name: tagGo }).click();
      await expect(page).toHaveURL(new RegExp(`[?&]tag=${tagGo}(?:&|$)`));
      await expect(page.locator('.post')).toHaveCount(1);
      await expect(page.locator('.post')).toContainText(goTitle);
    });
  });
});
