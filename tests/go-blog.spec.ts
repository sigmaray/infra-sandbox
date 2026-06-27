import { expect, test, type Page } from '@playwright/test';

const goBlogPort = process.env.GO_BLOG_HTTP_PORT ?? '8083';
const goBlogUrl = `http://127.0.0.1:${goBlogPort}`;

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

      for (let i = 1; i <= 6; i++) {
        await createPost(page, {
          title: `Pagination Post ${i}`,
          content: `Pagination content ${i}`,
        });
      }

      await page.goto(`${goBlogUrl}/`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.post')).toHaveCount(5);
      await expect(page.getByRole('link', { name: 'Next' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Previous' })).not.toBeVisible();

      await page.getByRole('link', { name: 'Next' }).click();
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
      await page.locator('form').evaluate((form) => form.setAttribute('novalidate', ''));
      await page.getByRole('button', { name: /create post/i }).click();

      await expect(page.locator('.error')).toContainText('Content is required');
      await expect(page).toHaveURL(/\/admin\/posts\/new/);
    });

    test('creates a post with title, content, and tags', async ({ page }) => {
      await loginToGoBlog(page);
      await createPost(page, {
        title: 'Feature Post',
        content: 'Feature post body',
        tags: 'go, tutorial',
      });

      await expect(page.locator('body')).toContainText('Feature Post');
      await expect(page.locator('body')).toContainText('Feature post body');

      await page.goto(`${goBlogUrl}/`, { waitUntil: 'domcontentloaded' });
      const post = page.locator('.post').filter({ hasText: 'Feature Post' });
      await expect(post).toBeVisible();
      await expect(post.locator('.post-content')).toContainText('Feature post body');
      await expect(post.getByRole('link', { name: 'go' })).toBeVisible();
      await expect(post.getByRole('link', { name: 'tutorial' })).toBeVisible();
    });

    test('filters posts by tag', async ({ page }) => {
      await loginToGoBlog(page);
      await createPost(page, {
        title: 'Go tagged post',
        content: 'Content for go tag',
        tags: 'e2e-go',
      });
      await createPost(page, {
        title: 'Web tagged post',
        content: 'Content for web tag',
        tags: 'e2e-web',
      });

      await page.goto(`${goBlogUrl}/?tag=e2e-go`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toContainText('Showing posts for tag: e2e-go');
      await expect(page.locator('.post')).toHaveCount(1);
      await expect(page.locator('.post')).toContainText('Go tagged post');
      await expect(page.locator('.post')).not.toContainText('Web tagged post');

      await page.getByRole('link', { name: 'Clear filter' }).click();
      await expect(page.locator('body')).not.toContainText('Showing posts for tag:');
      await expect(page.locator('.post').filter({ hasText: 'Go tagged post' })).toBeVisible();
      await expect(page.locator('.post').filter({ hasText: 'Web tagged post' })).toBeVisible();

      const goPost = page.locator('.post').filter({ hasText: 'Go tagged post' });
      await goPost.getByRole('link', { name: 'e2e-go' }).click();
      await expect(page).toHaveURL(/\?tag=e2e-go/);
      await expect(page.locator('.post')).toHaveCount(1);
      await expect(page.locator('.post')).toContainText('Go tagged post');
    });
  });
});
