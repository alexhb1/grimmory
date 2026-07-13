export const libraryCommandKeys = {
  all: () => ['libraries', 'command'] as const,
  create: () => [...libraryCommandKeys.all(), 'create'] as const,
  update: () => [...libraryCommandKeys.all(), 'update'] as const,
  delete: () => [...libraryCommandKeys.all(), 'delete'] as const,
  refresh: () => [...libraryCommandKeys.all(), 'refresh'] as const,
};

export const libraryCommandScopes = {
  libraries: {id: 'libraries.command'} as const,
};
