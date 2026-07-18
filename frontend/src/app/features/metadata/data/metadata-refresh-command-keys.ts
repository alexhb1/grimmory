import {bookCommandScopes} from '../../book/data/book-command-keys';

export const metadataRefreshCommandKeys = {
  all: () => ['metadata', 'command'] as const,
  refresh: () => [...metadataRefreshCommandKeys.all(), 'refresh'] as const,
};

export const metadataRefreshCommandScopes = {
  refresh: bookCommandScopes.metadata,
};
