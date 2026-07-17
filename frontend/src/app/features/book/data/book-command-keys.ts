export const bookCommandKeys = {
  all: () => ['books', 'command'] as const,
  readStatus: () => [...bookCommandKeys.all(), 'read-status'] as const,
  deleteBooks: () => [...bookCommandKeys.all(), 'delete'] as const,
  resetProgress: () => [...bookCommandKeys.all(), 'reset-progress'] as const,
  metadataFieldLocks: () => [...bookCommandKeys.all(), 'metadata', 'field-locks'] as const,
  metadataAllLocks: () => [...bookCommandKeys.all(), 'metadata', 'all-locks'] as const,
};

const bookLifecycleScope = {id: 'books.command.lifecycle'} as const;

export const bookCommandScopes = {
  readingState: {id: 'books.command.reading-state'} as const,
  lifecycle: bookLifecycleScope,
  deletion: bookLifecycleScope,
  metadata: {id: 'books.command.metadata'} as const,
};
