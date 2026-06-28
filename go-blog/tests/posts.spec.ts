import { expect, test } from '@playwright/test';

import { acceptNextDialog, createPost, login, uniqueId } from './helpers';

test.describe.serial('posts', () => {
  test('validates required content on create', async ({ page }) => {
    await login(page);
    await page.goto('/admin/posts/new', { waitUntil: 'domcontentloaded' });

    await page.locator('#title').fill('Title without content');
    await page.locator('#content').fill('');
    await page.locator('#content').evaluate((field) => field.removeAttribute('required'));
    await page.getByRole('button', { name: /create post/i }).click();

    await expect(page.locator('.error')).toContainText('Content is required');
    await expect(page).toHaveURL(/\/admin\/posts$/);
    await expect(page.getByRole('heading', { name: 'Create New Post' })).toBeVisible();
  });

  test('creates a post with title, content, and tags', async ({ page }) => {
    await login(page);
    const title = uniqueId('feature-post');
    const firstTag = uniqueId('go');
    const secondTag = uniqueId('tutorial');

    await createPost(page, {
      title,
      content: 'Feature post body',
      tags: `${firstTag}, ${secondTag}`,
    });

    await expect(page.locator('body')).toContainText(title);

    await page.goto(`/?tag=${firstTag}`, { waitUntil: 'domcontentloaded' });
    const post = page.locator('.post').filter({ hasText: title });
    await expect(post).toBeVisible();
    await expect(post.locator('.post-content')).toContainText('Feature post body');
    await expect(post.getByRole('link', { name: firstTag })).toBeVisible();
    await expect(post.getByRole('link', { name: secondTag })).toBeVisible();
  });

  test('filters posts by tag', async ({ page }) => {
    await login(page);
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

    await page.goto(`/?tag=${tagGo}`, { waitUntil: 'domcontentloaded' });
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

  test('paginates posts across pages', async ({ page }) => {
    await login(page);
    const paginationTag = uniqueId('e2e-pagination');

    for (let i = 1; i <= 6; i++) {
      await createPost(page, {
        title: `${paginationTag} Pagination Post ${i}`,
        content: `Pagination content ${i}`,
        tags: paginationTag,
      });
    }

    await page.goto(`/?tag=${paginationTag}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.post')).toHaveCount(5);
    await expect(page.getByRole('link', { name: 'Next' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Previous' })).not.toBeVisible();

    await page.getByRole('link', { name: 'Next' }).click();
    await expect(page).toHaveURL(
      new RegExp(
        `[?&]page=2(?:&|$).*tag=${paginationTag}|[?&]tag=${paginationTag}(?:&|$).*page=2`,
      ),
    );
    await expect(page.locator('.post')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Previous' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Next' })).not.toBeVisible();

    await page.getByRole('link', { name: 'Previous' }).click();
    await expect(page.locator('.post')).toHaveCount(5);
  });

  test('edits a post', async ({ page }) => {
    await login(page);
    const title = uniqueId('edit-post');
    const updatedTitle = uniqueId('edit-post-updated');
    const tag = uniqueId('edit-tag');
    const updatedTag = uniqueId('edit-tag-updated');

    await createPost(page, {
      title,
      content: 'Original content',
      tags: tag,
    });

    const row = page.locator('tr').filter({ hasText: title });
    await row.getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByRole('heading', { name: 'Edit Post' })).toBeVisible();

    await page.locator('#title').fill(updatedTitle);
    await page.locator('#content').fill('Updated content');
    await page.locator('#tags').fill(updatedTag);
    await page.getByRole('button', { name: /update post/i }).click();
    await expect(page).toHaveURL(/\/admin\/?$/);
    await expect(page.locator('body')).toContainText(updatedTitle);
    await expect(page.locator('body')).not.toContainText(title);

    await page.goto(`/?tag=${updatedTag}`, { waitUntil: 'domcontentloaded' });
    const post = page.locator('.post').filter({ hasText: updatedTitle });
    await expect(post).toBeVisible();
    await expect(post.locator('.post-content')).toContainText('Updated content');
  });

  test('deletes a post', async ({ page }) => {
    await login(page);
    const title = uniqueId('delete-post');

    await createPost(page, {
      title,
      content: 'Post to delete',
      tags: uniqueId('delete-tag'),
    });

    await acceptNextDialog(page);
    const row = page.locator('tr').filter({ hasText: title });
    await row.getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(/\/admin\/?$/);
    await expect(page.locator('body')).not.toContainText(title);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.post').filter({ hasText: title })).toHaveCount(0);
  });
});
