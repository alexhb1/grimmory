import {expect, test} from '@playwright/test';
import {
  createLoginAndBooksScenario,
  installLoginAndBooksRoutes,
  seedAuthenticatedSession
} from './login-and-books.fixture';

function populateBookPages(
  scenario: ReturnType<typeof createLoginAndBooksScenario>,
  count: number,
  pageSize: number,
): void {
  const template = scenario.books[0];
  scenario.bookPageSize = pageSize;
  scenario.books = Array.from({length: count}, (_, index) => {
    const id = index + 1;
    return {
      ...template,
      id,
      fileName: `mock-book-${id}.epub`,
      primaryFile: {
        ...(template['primaryFile'] as Record<string, unknown>),
        id: id * 10,
        bookId: id,
        fileName: `mock-book-${id}.epub`,
        filePath: `/books/mock-book-${id}.epub`,
      },
      metadata: {
        ...(template['metadata'] as Record<string, unknown>),
        bookId: id,
        title: `Mock Book ${String(id).padStart(3, '0')}`,
      },
    };
  });
}

test.describe('login and book browser smoke', () => {
  test('local login reaches the dashboard welcome state', async ({page}) => {
    await installLoginAndBooksRoutes(page, createLoginAndBooksScenario());

    await page.goto('/login');
    await expect(page.locator('#username')).toBeVisible();
    await page.locator('#username').fill('tester');
    await page.locator('#password input').fill('secret-password');
    await page.getByRole('button', {name: /sign in/i}).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('button', {name: /create (your )?library/i})).toBeVisible();
  });

  test('authenticated users can open the cursor book browser', async ({page}) => {
    const scenario = createLoginAndBooksScenario();
    const pageRequests: string[] = [];
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/v1/books/page') {
        pageRequests.push(request.url());
      }
    });
    await seedAuthenticatedSession(page);
    await installLoginAndBooksRoutes(page, scenario);

    await page.goto('/all-books');

    await expect(page).toHaveURL(/\/all-books$/);
    await expect(page.locator('app-book-card').filter({hasText: 'The Mock EPUB'})).toBeVisible();
    await expect(page.locator('app-book-card').filter({hasText: 'The Mock Comic'})).toBeVisible();

    await expect.poll(() => pageRequests.length).toBeGreaterThanOrEqual(2);
    const initialUrl = new URL(pageRequests[0]);
    expect(initialUrl.searchParams.has('page')).toBe(false);
    expect(initialUrl.searchParams.has('cursor')).toBe(false);
    expect(pageRequests[1]).toContain('cursor=smoke-next');
  });

  test('passes sort, search, and facet criteria directly to the paginated endpoint', async ({page}) => {
    const pageRequests: URL[] = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname === '/api/v1/books/page') pageRequests.push(url);
    });
    await seedAuthenticatedSession(page);
    await installLoginAndBooksRoutes(page, createLoginAndBooksScenario());

    await page.goto(
      '/all-books?sort=-title&query=Mock&facet=genre%3AFantasy&facet=tag%3AOwned'
    );
    await expect(page.locator('app-book-card').first()).toBeVisible();

    const initial = pageRequests.find(url => !url.searchParams.has('cursor'));
    expect(initial?.searchParams.get('sort')).toBe('-title');
    expect(initial?.searchParams.get('query')).toBe('Mock');
    expect(initial?.searchParams.getAll('facet')).toEqual(['genre:Fantasy', 'tag:Owned']);
  });

  test('keeps a backend-advertised random sort one-way', async ({page}) => {
    await seedAuthenticatedSession(page);
    await installLoginAndBooksRoutes(page, createLoginAndBooksScenario());

    await page.goto('/all-books?sort=random');
    await expect(page.locator('app-book-card').first()).toBeVisible();
    await expect(page.getByRole('button', {name: /sort ascending|sort descending/i})).toHaveCount(0);
  });

  test('returns to the same random-sort grid position from the cached pages', async ({page}) => {
    const scenario = createLoginAndBooksScenario();
    populateBookPages(scenario, 240, 60);

    await seedAuthenticatedSession(page);
    await installLoginAndBooksRoutes(page, scenario);

    await page.goto('/all-books?sort=random');
    const target = page.locator('app-book-card').filter({hasText: 'Mock Book 131'});
    await page.mouse.move(900, 600);
    await expect.poll(async () => {
      if (await target.count() === 0) {
        await page.mouse.wheel(0, 1800);
      }
      return target.count();
    }, {timeout: 15_000}).toBe(1);
    await target.evaluate(element => element.scrollIntoView({block: 'center'}));

    const anchorBefore = await page.locator('app-book-card').evaluateAll(cards => {
      const visible = cards
        .map(card => ({card, rect: card.getBoundingClientRect()}))
        .filter(({rect}) => rect.bottom > 0 && rect.top < window.innerHeight)
        .sort((first, second) => first.rect.top - second.rect.top || first.rect.left - second.rect.left)[0];
      const link = visible?.card.querySelector('a')?.getAttribute('href');
      const rowLinks = visible
        ? cards
            .filter(card => Math.abs(card.getBoundingClientRect().top - visible.rect.top) < 1)
            .map(card => card.querySelector('a')?.getAttribute('href'))
            .filter((href): href is string => typeof href === 'string')
        : [];
      return visible && link ? {link, top: visible.rect.top, rowLinks} : null;
    });
    expect(anchorBefore).not.toBeNull();

    await page.locator('a.sidebar-brand').click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/all-books\?sort=random$/);

    const restoredAnchor = page.locator(`app-book-card a[href="${anchorBefore?.link}"]`);
    await expect(restoredAnchor).toBeVisible();
    await expect.poll(() => restoredAnchor.evaluate(
      element => element.parentElement?.getBoundingClientRect().top,
    )).toBeCloseTo(anchorBefore?.top ?? 0, 0);
    const restoredRowLinks = await page.locator('app-book-card').evaluateAll((cards, top) =>
      cards
        .filter(card => Math.abs(card.getBoundingClientRect().top - top) < 1)
        .map(card => card.querySelector('a')?.getAttribute('href'))
        .filter((href): href is string => typeof href === 'string'),
      anchorBefore?.top ?? 0,
    );
    expect(restoredRowLinks).toEqual(anchorBefore?.rowLinks);
  });

  test('returns to the same deterministic table position from the cached pages', async ({page}) => {
    const scenario = createLoginAndBooksScenario();
    populateBookPages(scenario, 180, 60);
    await seedAuthenticatedSession(page);
    await installLoginAndBooksRoutes(page, scenario);

    await page.goto('/all-books?sort=title&view=table');
    const scroller = page.locator('.book-browse-table-pane');
    const target = page.locator('a[href^="/book/91"]');
    await expect(scroller).toBeVisible();
    await expect.poll(async () => {
      if (await target.count() === 0) {
        await scroller.evaluate(element => element.scrollTo({top: 90 * 54}));
      }
      return target.count();
    }, {timeout: 15_000}).toBe(1);
    await target.evaluate(element => element.scrollIntoView({block: 'center'}));

    const anchorBefore = await scroller.locator('tbody tr').evaluateAll(rows => {
      const pane = rows[0]?.closest('.book-browse-table-pane');
      if (!pane) return null;
      const paneRect = pane.getBoundingClientRect();
      const visible = rows
        .map(row => ({row, rect: row.getBoundingClientRect()}))
        .filter(({rect}) => rect.bottom > paneRect.top && rect.top < paneRect.bottom)
        .sort((first, second) => first.rect.top - second.rect.top)[0];
      const link = visible?.row.querySelector('a[href^="/book/"]')?.getAttribute('href');
      return visible && link ? {link, top: visible.rect.top - paneRect.top} : null;
    });
    expect(anchorBefore).not.toBeNull();

    await page.locator('a.sidebar-brand').click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/all-books\?sort=title&view=table$/);

    const restoredAnchor = page.locator(`a[href="${anchorBefore?.link}"]`);
    await expect(restoredAnchor).toBeVisible();
    await expect.poll(async () => {
      const row = restoredAnchor.locator('xpath=ancestor::tr');
      const rowBox = await row.boundingBox();
      const paneBox = await scroller.boundingBox();
      return rowBox && paneBox ? rowBox.y - paneBox.y : null;
    }).toBeCloseTo(anchorBefore?.top ?? 0, 0);
  });
});
