export const shelfDefinitionQueryKeys = {
  all: () => ['shelves'] as const,
  definitions: () => [...shelfDefinitionQueryKeys.all(), 'query', 'definitions'] as const,
};
