import { expect, type Page } from '@playwright/test';

const drupalPort = process.env.DRUPAL_HTTP_PORT ?? '8080';
export const drupalUrl = `http://127.0.0.1:${drupalPort}`;
export const blogUrl = `${drupalUrl}/blog`;

export async function loginToDrupal(page: Page) {
  await page.goto(`${drupalUrl}/user/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#edit-name').fill('admin');
  await page.locator('#edit-pass').fill('test-admin');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).not.toHaveURL(/\/user\/login/);
}

export async function isBlogConfigured(page: Page): Promise<boolean> {
  await page.goto(blogUrl, { waitUntil: 'domcontentloaded' });
  return (
    (await page.locator('#views-exposed-form-blog-page-1').count()) > 0 &&
    (await page.locator('#edit-tag').count()) > 0
  );
}

async function saveStatusMessage(page: Page) {
  await expect(page.getByRole('contentinfo', { name: 'Status message' })).toBeVisible({
    timeout: 120_000,
  });
}

async function enableRequiredModules(page: Page) {
  await page.goto(`${drupalUrl}/admin/modules`, { waitUntil: 'domcontentloaded' });

  const modules = [
    { id: 'edit-modules-taxonomy-enable' },
    { id: 'edit-modules-views-enable' },
    { id: 'edit-modules-views-ui-enable' },
    { id: 'edit-modules-field-ui-enable' },
  ];

  let needsSave = false;
  for (const module of modules) {
    const checkbox = page.locator(`#${module.id}`);
    if ((await checkbox.count()) > 0 && !(await checkbox.isChecked())) {
      await checkbox.check({ force: true });
      needsSave = true;
    }
  }

  if (needsSave) {
    await page.locator('#edit-submit').click();
    await saveStatusMessage(page);
  }
}

async function createTagsVocabulary(page: Page) {
  await page.goto(`${drupalUrl}/admin/structure/taxonomy`, { waitUntil: 'domcontentloaded' });
  if ((await page.getByRole('link', { name: 'Tags' }).count()) > 0) {
    return;
  }

  await page.goto(`${drupalUrl}/admin/structure/taxonomy/add`, { waitUntil: 'domcontentloaded' });
  await page.locator('#edit-name').fill('Tags');
  await page.locator('#edit-submit').click();
  await saveStatusMessage(page);
}

async function createBlogPostContentType(page: Page) {
  await page.goto(`${drupalUrl}/admin/structure/types`, { waitUntil: 'domcontentloaded' });
  if ((await page.getByRole('cell', { name: 'Blog post' }).count()) > 0) {
    return;
  }

  await page.goto(`${drupalUrl}/admin/structure/types/add`, { waitUntil: 'domcontentloaded' });
  await page.locator('#edit-name').fill('Blog post');
  await page.locator('#edit-description').fill('A blog post entry.');
  await page.locator('#edit-submit').click();
  await saveStatusMessage(page);
}

async function addTagsField(page: Page) {
  await page.goto(`${drupalUrl}/admin/structure/types/manage/blog_post/fields`, {
    waitUntil: 'domcontentloaded',
  });
  if ((await page.getByRole('cell', { name: 'field_tags' }).count()) > 0) {
    return;
  }

  await page.goto(`${drupalUrl}/admin/structure/types/manage/blog_post/fields/add-field`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('#edit-new-storage-type--5').check();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('radio', { name: /taxonomy term/i }).check();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.locator('#edit-label').fill('Tags');
  await page.locator('#edit-field-name').fill('field_tags');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.locator('#edit-cardinality-unlimited').check();
  await page.getByRole('button', { name: 'Save field settings' }).click();
  await saveStatusMessage(page);

  await page.locator('#edit-settings-handler-settings-auto-create').check();
  await page.locator('#edit-settings-handler-settings-target-bundles-tags').check();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await saveStatusMessage(page);
}

async function createBlogView(page: Page) {
  await page.goto(`${drupalUrl}/admin/structure/views`, { waitUntil: 'domcontentloaded' });
  if ((await page.getByRole('link', { name: 'Blog', exact: true }).count()) > 0) {
    return;
  }

  await page.goto(`${drupalUrl}/admin/structure/views/add`, { waitUntil: 'domcontentloaded' });
  await page.locator('#edit-label').fill('Blog');
  await page.locator('#edit-id').fill('blog');
  await page.locator('#edit-show-type').selectOption('blog_post');
  await page.locator('#edit-show-sort').selectOption('node_field_data-created:DESC');
  await page.locator('#edit-page-create').check();
  await page.locator('#edit-page-title').fill('Blog');
  await page.locator('#edit-page-path').fill('blog');
  await page.locator('#edit-page-style-style-plugin').selectOption('default');
  await page.locator('#edit-page-style-row-plugin').selectOption('fields');
  await page.locator('#edit-page-items-per-page').fill('5');
  await page.locator('#edit-page-pager').check();
  await page.getByRole('button', { name: 'Save and edit' }).click();
  await expect(page).toHaveURL(/\/admin\/structure\/views\/view\/blog\/edit/);
}

async function ensureViewFields(page: Page) {
  await page.goto(`${drupalUrl}/admin/structure/views/view/blog/edit/page_1`, {
    waitUntil: 'domcontentloaded',
  });

  const requiredFields = [
    { key: 'title', checkbox: '#edit-name-node-field-datatitle' },
    { key: 'body', checkbox: '#edit-name-node-bodybody' },
    { key: 'field_tags', checkbox: '#edit-name-node-field-tagsfield-tags' },
  ];

  const missing = [];
  for (const field of requiredFields) {
    if ((await page.locator(`a[href*="/field/${field.key}"]`).count()) === 0) {
      missing.push(field.checkbox);
    }
  }

  if (missing.length === 0) {
    return;
  }

  await page.goto(`${drupalUrl}/admin/structure/views/nojs/add-handler/blog/page_1/field`, {
    waitUntil: 'domcontentloaded',
  });
  for (const checkbox of missing) {
    await page.locator(checkbox).check();
  }
  await page.locator('#edit-submit').click();
}

async function configureViewField(
  page: Page,
  fieldKey: string,
  options: {
    elementType?: string;
    elementClass?: string;
    elementWrapperClass?: string;
    alterPath?: string;
    hideLabel?: boolean;
  },
) {
  await page.goto(`${drupalUrl}/admin/structure/views/nojs/handler/blog/page_1/field/${fieldKey}`, {
    waitUntil: 'domcontentloaded',
  });

  if (options.hideLabel) {
    await page.locator('#edit-options-label').selectOption('');
  }

  if (options.elementType) {
    await page.locator('#edit-options-element-type-enable').check();
    await page.locator('#edit-options-element-type').fill(options.elementType);
  }

  if (options.elementClass) {
    await page.locator('#edit-options-element-class-enable').check();
    await page.locator('#edit-options-element-class').fill(options.elementClass);
  }

  if (options.elementWrapperClass) {
    await page.locator('#edit-options-element-wrapper-class-enable').check();
    await page.locator('#edit-options-element-wrapper-class').fill(options.elementWrapperClass);
  }

  if (options.alterPath) {
    await page.locator('#edit-options-alter-make-link').check();
    await page.locator('#edit-options-alter-path').fill(options.alterPath);
  }

  await page.locator('#edit-submit').click();
}

async function configureViewFields(page: Page) {
  await configureViewField(page, 'title', {
    hideLabel: true,
    elementType: 'h2',
    elementClass: 'blog-post-title',
    elementWrapperClass: 'blog-post',
  });
  await configureViewField(page, 'body', {
    hideLabel: true,
    elementClass: 'blog-post-content',
  });
  await configureViewField(page, 'field_tags', {
    hideLabel: true,
    elementClass: 'blog-post-tags',
    alterPath: 'blog?tag={{ field_tags__target_id }}',
  });
}

async function ensureTagFilter(page: Page) {
  await page.goto(`${drupalUrl}/admin/structure/views/view/blog/edit/page_1`, {
    waitUntil: 'domcontentloaded',
  });

  if ((await page.locator('a[href*="/filter/tid"]').count()) === 0) {
    await page.goto(`${drupalUrl}/admin/structure/views/nojs/add-handler/blog/page_1/filter`, {
      waitUntil: 'domcontentloaded',
    });
    await page.locator('#edit-name-taxonomy-indextid').check();
    await page.locator('#edit-submit').click();
  }

  await page.goto(`${drupalUrl}/admin/structure/views/nojs/handler/blog/page_1/filter/tid`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('#edit-options-expose-button-checkbox-checkbox').check();
  await page.locator('#edit-options-expose-label').fill('Tag');
  await page.locator('#edit-options-expose-identifier').fill('tag');
  await page.locator('#edit-submit').click();

  await page.goto(`${drupalUrl}/admin/structure/views/nojs/handler-extra/blog/page_1/filter/tid`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('#edit-options-vid-tags').check();
  await page.locator('#edit-submit').click();
}

async function configureViewDisplay(page: Page) {
  await page.goto(`${drupalUrl}/admin/structure/views/nojs/display/blog/page_1/style_options`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('#edit-style-options-row-class').fill('blog-post');
  await page.locator('#edit-submit').click();

  await page.goto(`${drupalUrl}/admin/structure/views/nojs/display/blog/page_1/exposed_form_options`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('#edit-exposed-form-options-reset-button').check();
  await page.locator('#edit-exposed-form-options-reset-button-label').fill('Clear filter');
  await page.locator('#edit-submit').click();
}

async function saveBlogView(page: Page) {
  await page.goto(`${drupalUrl}/admin/structure/views/view/blog/edit/page_1`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('#edit-actions-submit').click();
  await saveStatusMessage(page);
}

export async function setupDrupalBlog(page: Page) {
  if (await isBlogConfigured(page)) {
    return;
  }

  await loginToDrupal(page);
  await enableRequiredModules(page);
  await createTagsVocabulary(page);
  await createBlogPostContentType(page);
  await addTagsField(page);
  await createBlogView(page);
  await ensureViewFields(page);
  await configureViewFields(page);
  await ensureTagFilter(page);
  await configureViewDisplay(page);
  await saveBlogView(page);

  await page.goto(blogUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#views-exposed-form-blog-page-1')).toBeVisible();
  await expect(page.locator('#edit-tag')).toBeVisible();
}
