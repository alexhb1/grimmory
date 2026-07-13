export type ChangeCoversKind = 'upload' | 'regenerate' | 'generate';

export interface UploadCoverChangeVariables {
  readonly kind: 'upload';
  readonly bookIds: readonly number[];
  readonly file: File;
}

export interface RegenerateCoversVariables {
  readonly kind: 'regenerate';
  readonly bookIds: readonly number[];
}

export interface GenerateCoversVariables {
  readonly kind: 'generate';
  readonly bookIds: readonly number[];
}

export type ChangeCoversVariables =
  | UploadCoverChangeVariables
  | RegenerateCoversVariables
  | GenerateCoversVariables;

export interface ChangeCoversResult {
  readonly kind: ChangeCoversKind;
  readonly requestedBookIds: readonly number[];
}
