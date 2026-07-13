export interface CombineBooksVariables {
  readonly targetBookId: number;
  readonly sourceBookIds: readonly number[];
  readonly moveFiles: boolean;
}

export interface CombineBooksResult {
  readonly targetBookId: number;
  readonly removedSourceBookIds: readonly number[];
}

export interface OrganizeBookFilesMove {
  readonly bookId: number;
  readonly targetLibraryId: number;
  readonly targetLibraryPathId: number;
}

export interface OrganizeBookFilesVariables {
  readonly moves: readonly OrganizeBookFilesMove[];
}

export interface OrganizeBookFilesResult {
  readonly acknowledgedBookIds: readonly number[];
}
