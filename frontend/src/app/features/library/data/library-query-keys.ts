export const libraryQueryKeys = {
  definitions: () => ['libraries'] as const,
  formatCounts: (libraryId: number) => ['libraries', 'format-counts', libraryId] as const,
};
