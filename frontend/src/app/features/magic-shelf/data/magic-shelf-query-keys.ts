export const magicShelfQueryKeys = {
  all: () => ['magicShelves'] as const,
  definitions: () => [...magicShelfQueryKeys.all(), 'query', 'definitions'] as const,
};
