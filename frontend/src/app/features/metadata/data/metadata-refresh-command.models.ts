export type MetadataRefreshTarget =
  | {readonly kind: 'books'; readonly bookIds: readonly number[]}
  | {readonly kind: 'library'; readonly libraryId: number};

export interface RefreshMetadataVariables {
  readonly target: MetadataRefreshTarget;
}

export interface RefreshMetadataResult {
  readonly taskId: string;
}
