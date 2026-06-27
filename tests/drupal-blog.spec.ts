import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  blogUrl,
  drupalUrl,
  loginToDrupal,
  setupDrupalBlog,
} from './helpers/drupal-blog-setup';

async function addTag(page: Page, tag: string, index = 0) {
  if (index > 0) {
    await page.getByRole('button', { name: 'Add another item' }).click();
    await expect(page.locator(`#edit-field-tags-${index}-target-id`)).toBeVisible();
  }

  const input = page.locator(`#edit-field-tags-${index}-target-id`);
  await input.click();
  await input.fill('');
  await input.pressSequentially(tag, { delay: 30 });

  const menuItem = page.locator('.ui-autocomplete .ui-menu-item').first();
  if (await menuItem.isVisible().catch(() => false)) {
    await menuItem.click();
    return;
  }

  await input.press('Enter');
}

async function createBlogPost(
  page: Page,
  opts: { title: string; content: string; tags?: string[] },
) {
  await page.goto(`${drupalUrl}/node/add/blog_post`, { waitUntil: 'domcontentloaded' });
  await page.locator('#edit-title-0-value').fill(opts.title);
  await page.locator('#edit-body-0-value').fill(opts.content);

  if (opts.tags) {
    for (let i = 0; i < opts.tags.length; i++) {
      await addTag(page, opts.tags[i], i);
    }
  }

  await page.locator('#edit-submit').click();
  await expect(page).toHaveURL(/\/node\/\d+/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(opts.title);
}

async function anonymousPage(browser: Browser) {
  const context = await browser.newContext();
  return context.newPage();
}

test.describe('Drupal blog', () => {
  test.describe.serial('posts', () => {
    test('configures blog through admin UI', async ({ page }) => {
      await setupDrupalBlog(page);
    });

    test('paginates blog posts for anonymous users', async ({ page, browser }) => {
      await loginToDrupal(page);
      const paginationPrefix = `E2E Pag ${Date.now()}`;

      for (let i = 1; i <= 6; i++) {
        await createBlogPost(page, {
          title: `${paginationPrefix} ${i}`,
          content: `Drupal pagination body ${i}`,
        });
      }

      const anonPage = await anonymousPage(browser);
      await anonPage.goto(blogUrl, { waitUntil: 'domcontentloaded' });

      const pageOnePosts = anonPage
        .locator('.blog-post.views-row')
        .filter({ hasText: paginationPrefix });
      await expect(pageOnePosts).toHaveCount(5);
      await expect(anonPage.locator('.pager__item--next a')).toBeVisible();
      await expect(anonPage.locator('.pager__item--previous a')).not.toBeVisible();

      await anonPage.locator('.pager__item--next a').click();
      await expect(anonPage).toHaveURL(/\?page=1(?:$|&)/);
      const pageTwoPosts = anonPage
        .locator('.blog-post.views-row')
        .filter({ hasText: paginationPrefix });
      await expect(pageTwoPosts).toHaveCount(1);
      await expect(anonPage.locator('.pager__item--previous a')).toBeVisible();

      await anonPage.locator('.pager__item--previous a').click();
      await expect(anonPage).not.toHaveURL(/\?page=1(?:$|&)/);
      await expect(pageOnePosts).toHaveCount(5);
    });

    test('shows created blog posts to anonymous users', async ({ page, browser }) => {
      await loginToDrupal(page);
      await createBlogPost(page, {
        title: 'Drupal Public Post',
        content: 'Drupal public post body',
        tags: ['drupal-feature'],
      });

      const anonPage = await anonymousPage(browser);
      await anonPage.goto(blogUrl, { waitUntil: 'domcontentloaded' });

      const post = anonPage.locator('.blog-post.views-row').filter({ hasText: 'Drupal Public Post' });
      await expect(post).toBeVisible();
      await expect(post.locator('.blog-post-content')).toContainText('Drupal public post body');
      await expect(post.getByRole('link', { name: 'drupal-feature' })).toBeVisible();
    });

    test('filters blog posts by tag for anonymous users', async ({ page, browser }) => {
      await loginToDrupal(page);
      const tagGo = `e2e-drupal-go-${Date.now()}`;
      const tagWeb = `e2e-drupal-web-${Date.now()}`;

      await createBlogPost(page, {
        title: 'Drupal Go tagged post',
        content: 'Drupal content for go tag',
        tags: [tagGo],
      });
      await createBlogPost(page, {
        title: 'Drupal Web tagged post',
        content: 'Drupal content for web tag',
        tags: [tagWeb],
      });

      const anonPage = await anonymousPage(browser);
      await anonPage.goto(blogUrl, { waitUntil: 'domcontentloaded' });

      await anonPage.locator('#edit-tag').selectOption({ label: tagGo });
      await anonPage.locator('#edit-submit-blog').click();

      const filteredPosts = anonPage.locator('.blog-post.views-row');
      await expect(filteredPosts).toHaveCount(1);
      await expect(filteredPosts).toContainText('Drupal Go tagged post');
      await expect(filteredPosts).not.toContainText('Drupal Web tagged post');

      await anonPage.getByRole('button', { name: 'Clear filter' }).click();
      await expect(anonPage.locator('.blog-post.views-row').filter({ hasText: 'Drupal Go tagged post' })).toBeVisible();
      await expect(anonPage.locator('.blog-post.views-row').filter({ hasText: 'Drupal Web tagged post' })).toBeVisible();

      const goPost = anonPage.locator('.blog-post.views-row').filter({ hasText: 'Drupal Go tagged post' });
      await goPost.getByRole('link', { name: tagGo }).click();
      await expect(anonPage).toHaveURL(/\?tag=/);
      await expect(anonPage.locator('.blog-post.views-row')).toHaveCount(1);
      await expect(anonPage.locator('.blog-post.views-row')).toContainText('Drupal Go tagged post');
    });
  });
});
