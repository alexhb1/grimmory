import {bookCommandKeys, bookCommandScopes} from './book-command-keys';

export const bookFileCommandKeys = {
  all: () => [...bookCommandKeys.all(), 'file'] as const,
  combineBooks: () => [...bookFileCommandKeys.all(), 'combine-books'] as const,
  organizeFiles: () => [...bookFileCommandKeys.all(), 'organize-files'] as const,
};

export const bookFileCommandScopes = {
  files: bookCommandScopes.lifecycle,
};
