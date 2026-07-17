import type {Page, Route} from '@playwright/test';

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+Nf8zAAAAAElFTkSuQmCC',
  'base64'
);

type LoginAndBooksScenario = {
  publicSettings: Record<string, unknown>;
  appSettings: Record<string, unknown>;
  user: Record<string, unknown>;
  libraries: Array<Record<string, unknown>>;
  shelves: Array<Record<string, unknown>>;
  magicShelves: Array<Record<string, unknown>>;
  books: Array<Record<string, unknown>>;
  bookPageSize: number;
};

function createJwt(expSeconds = 4_102_444_800): string {
  const header = Buffer.from(JSON.stringify({alg: 'none', typ: 'JWT'})).toString('base64url');
  const payload = Buffer.from(JSON.stringify({exp: expSeconds, sub: '1'})).toString('base64url');
  return `${header}.${payload}.`;
}

function asJson(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function isThumbnailRequest(pathname: string): boolean {
  return pathname.startsWith('/api/v1/media/book/') && pathname.includes('/thumbnail');
}

export function createLoginAndBooksScenario(): LoginAndBooksScenario {
  return {
    publicSettings: {
      oidcEnabled: false,
      remoteAuthEnabled: false,
      oidcProviderDetails: null,
      oidcForceOnlyMode: false,
    },
    appSettings: {
      remoteAuthEnabled: false,
      oidcEnabled: false,
      oidcProviderDetails: null,
      oidcForceOnlyMode: false,
      opdsServerEnabled: false,
      komgaApiEnabled: false,
      metadataProviderSettings: {},
      metadataMatchWeights: {},
      maxFileUploadSizeInMb: 128,
    },
    user: {
      id: 1,
      username: 'tester',
      name: 'Test Reader',
      email: 'tester@example.com',
      assignedLibraries: [{id: 1, name: 'Main Library'}],
      permissions: {
        admin: true,
        canManageLibrary: true,
        canUpload: true,
        canAccessBookdrop: true,
        canAccessLibraryStats: true,
        canAccessUserStats: true,
        canManageGlobalPreferences: true,
        demoUser: false,
      },
      userSettings: {
        sidebarLibrarySorting: {field: 'name', order: 'ASC'},
        sidebarShelfSorting: {field: 'name', order: 'ASC'},
        sidebarMagicShelfSorting: {field: 'name', order: 'ASC'},
        entityViewPreferences: {
          global: {
            sortKey: 'title',
            sortDir: 'ASC',
            view: 'GRID',
            coverSize: 100,
            seriesCollapsed: false,
            overlayBookType: false,
          },
          overrides: [],
        },
        tableColumnPreference: [{field: 'title', visible: true, order: 0}],
        dashboardConfig: {scrollers: []},
        visibleFilters: ['author', 'series', 'bookType'],
        visibleSortFields: ['title', 'addedOn', 'lastReadTime'],
        filterMode: 'and',
      },
    },
    libraries: [],
    shelves: [],
    magicShelves: [],
    bookPageSize: 1,
    books: [
      {
        id: 1,
        libraryId: 1,
        libraryName: 'Main Library',
        fileName: 'the-mock-epub.epub',
        primaryFile: {
          id: 11,
          bookId: 1,
          book: true,
          folderBased: false,
          bookType: 'EPUB',
          fileName: 'the-mock-epub.epub',
          filePath: '/books/the-mock-epub.epub',
        },
        metadata: {
          bookId: 1,
          title: 'The Mock EPUB',
          authors: ['A. Author'],
          seriesName: 'Smoke Series',
          seriesNumber: 1,
          language: 'en',
          allMetadataLocked: false,
        },
        shelves: [{id: 101, name: 'Featured', publicShelf: false, bookCount: 1}],
        readStatus: 'UNREAD',
        addedOn: '2025-01-01T00:00:00Z',
      },
      {
        id: 2,
        libraryId: 1,
        libraryName: 'Main Library',
        fileName: 'the-mock-comic.cbz',
        primaryFile: {
          id: 21,
          bookId: 2,
          book: true,
          folderBased: false,
          bookType: 'CBX',
          fileName: 'the-mock-comic.cbz',
          filePath: '/books/the-mock-comic.cbz',
        },
        metadata: {
          bookId: 2,
          title: 'The Mock Comic',
          authors: ['B. Artist'],
          seriesName: 'Comic Smoke Series',
          seriesNumber: 7,
          language: 'en',
          allMetadataLocked: false,
        },
        shelves: [],
        readStatus: 'READING',
        addedOn: '2025-01-03T00:00:00Z',
      },
    ],
  };
}

export async function seedAuthenticatedSession(page: Page): Promise<void> {
  const accessToken = createJwt();
  const refreshToken = 'refresh-token';

  await page.addInitScript(
    ({accessTokenValue, refreshTokenValue}) => {
      localStorage.setItem('accessToken_Internal', accessTokenValue);
      localStorage.setItem('refreshToken_Internal', refreshTokenValue);
    },
    {accessTokenValue: accessToken, refreshTokenValue: refreshToken}
  );
}

export async function installLoginAndBooksRoutes(
  page: Page,
  scenario = createLoginAndBooksScenario()
): Promise<void> {
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const {pathname} = url;
    const method = request.method();

    if (pathname === '/api/public/settings' && method === 'HEAD') {
      await route.fulfill({status: 200, body: ''});
      return;
    }

    if (pathname === '/api/v1/setup/status' && method === 'GET') {
      await asJson(route, {data: true});
      return;
    }

    if (pathname === '/api/v1/public-settings' && method === 'GET') {
      await asJson(route, scenario.publicSettings);
      return;
    }

    if (pathname === '/api/v1/settings' && method === 'GET') {
      await asJson(route, scenario.appSettings);
      return;
    }

    if (pathname === '/api/v1/auth/login' && method === 'POST') {
      await asJson(route, {
        accessToken: createJwt(),
        refreshToken: 'refresh-token',
        isDefaultPassword: false,
      });
      return;
    }

    if (pathname === '/api/v1/auth/refresh' && method === 'POST') {
      await asJson(route, {
        accessToken: createJwt(),
        refreshToken: 'refresh-token',
      });
      return;
    }

    if (pathname === '/api/v1/users/me' && method === 'GET') {
      await asJson(route, scenario.user);
      return;
    }

    if (pathname === '/api/v1/libraries' && method === 'GET') {
      await asJson(route, scenario.libraries);
      return;
    }

    if (pathname === '/api/v1/shelves' && method === 'GET') {
      await asJson(route, scenario.shelves);
      return;
    }

    if (pathname === '/api/magic-shelves' && method === 'GET') {
      await asJson(route, scenario.magicShelves);
      return;
    }

    if (pathname === '/api/v1/books/page' && method === 'GET') {
      const cursor = url.searchParams.get('cursor');
      const numberedCursor = cursor?.match(/^smoke-page-(\d+)$/)?.[1];
      const pageIndex = cursor === null || cursor === 'smoke-self'
        ? 0
        : cursor === 'smoke-next'
          ? 1
          : numberedCursor === undefined
            ? NaN
            : Number(numberedCursor);
      if (!Number.isInteger(pageIndex)) {
        throw new Error(`Unhandled book-page cursor: ${cursor}`);
      }
      const pageStart = pageIndex * scenario.bookPageSize;
      const content = scenario.books.slice(pageStart, pageStart + scenario.bookPageSize);
      const pageHref = (nextCursor: string): string => {
        const params = new URLSearchParams(url.searchParams);
        params.set('cursor', nextCursor);
        return `${pathname}?${params.toString()}`;
      };
      const links = [{
        rel: ['self'],
        href: pageHref(pageIndex === 0 ? 'smoke-self' : `smoke-page-${pageIndex}`),
        type: 'application/json',
      }];
      if (pageIndex > 0) {
        links.push({
          rel: ['previous'],
          href: pageHref(pageIndex === 1 ? 'smoke-self' : `smoke-page-${pageIndex - 1}`),
          type: 'application/json',
        });
      }
      if (pageStart + scenario.bookPageSize < scenario.books.length) {
        links.push({
          rel: ['next'],
          href: pageHref(pageIndex === 0 ? 'smoke-next' : `smoke-page-${pageIndex + 1}`),
          type: 'application/json',
        });
      }
      await asJson(route, {
        content,
        page: {
          number: pageIndex,
          size: scenario.bookPageSize,
          totalElements: scenario.books.length,
          totalPages: Math.ceil(scenario.books.length / scenario.bookPageSize),
        },
        links,
      });
      return;
    }

    if (pathname === '/api/v1/books/facets' && method === 'GET') {
      await asJson(route, {
        facets: [{
          metadata: {rel: 'sort', key: 'sort', title: 'Sort'},
          links: [
            {rel: 'sort', href: '/api/v1/books/page?sort=title', type: 'application/json', title: 'Title ascending', value: 'title'},
            {rel: 'sort', href: '/api/v1/books/page?sort=-title', type: 'application/json', title: 'Title descending', value: '-title'},
            {rel: 'sort', href: '/api/v1/books/page?sort=pageCount', type: 'application/json', title: 'Page count', value: 'pageCount'},
          ],
        }],
      });
      return;
    }

    if (pathname === '/api/v1/books' && method === 'GET') {
      await asJson(route, scenario.books);
      return;
    }

    if (pathname === '/api/v1/authors' && method === 'GET') {
      await asJson(route, []);
      return;
    }

    if (pathname === '/api/metadata/tasks/active' && method === 'GET') {
      await asJson(route, []);
      return;
    }

    if (pathname === '/api/v1/bookdrop/notification' && method === 'GET') {
      await asJson(route, {pendingCount: 0, totalCount: 0, lastUpdatedAt: null});
      return;
    }

    if (pathname === '/api/v1/libraries/health' && method === 'GET') {
      await asJson(route, {});
      return;
    }

    if (pathname === '/api/v1/version' && method === 'GET') {
      await asJson(route, {current: 'test', latest: 'test'});
      return;
    }

    if (isThumbnailRequest(pathname) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: tinyPng,
      });
      return;
    }

    throw new Error(`Unhandled login-and-books route: ${method} ${pathname}`);
  });
}
