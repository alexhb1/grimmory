import {type User} from '../../settings/user-management/user.service';
import {type BookSummary} from './book-response.models';

type BookActionPermissionSource = Pick<
  User['permissions'],
  | 'admin'
  | 'canDownload'
  | 'canEmailBook'
  | 'canEditMetadata'
  | 'canDeleteBook'
  | 'canBulkResetGrimmoryReadProgress'
  | 'canBulkResetKoReaderReadProgress'
  | 'canMoveOrganizeFiles'
>;

interface BookActionPermissions {
  readonly canDownload: boolean;
  readonly canEmailBook: boolean;
  readonly canEditMetadata: boolean;
  readonly canDeleteBook: boolean;
  readonly canResetGrimmoryProgress: boolean;
  readonly canResetKoreaderProgress: boolean;
  readonly canOrganizeFiles: boolean;
}

export function bookActionPermissions(
  permissions: BookActionPermissionSource | null | undefined,
): BookActionPermissions {
  const admin = !!permissions?.admin;
  return {
    canDownload: admin || !!permissions?.canDownload,
    canEmailBook: admin || !!permissions?.canEmailBook,
    canEditMetadata: admin || !!permissions?.canEditMetadata,
    canDeleteBook: admin || !!permissions?.canDeleteBook,
    canResetGrimmoryProgress: admin || !!permissions?.canBulkResetGrimmoryReadProgress,
    canResetKoreaderProgress: admin || !!permissions?.canBulkResetKoReaderReadProgress,
    canOrganizeFiles: admin || !!permissions?.canMoveOrganizeFiles,
  };
}

export type BookReadAction = 'read' | 'continueReading' | 'play' | 'continueListening';

export function bookGrimmoryProgress(book: BookSummary): number | null {
  return (
    book.epubProgress?.percentage ??
    book.pdfProgress?.percentage ??
    book.cbxProgress?.percentage ??
    book.audiobookProgress?.percentage ??
    null
  );
}

export function bookProgressPercentage(book: BookSummary): number | null {
  return bookGrimmoryProgress(book)
    ?? book.koreaderProgress?.percentage
    ?? book.koboProgress?.percentage
    ?? null;
}

function bookPartlyRead(book: BookSummary): boolean {
  const progress = bookProgressPercentage(book);
  return progress !== null && progress > 0 && progress < 100;
}

export function bookReadAction(book: BookSummary): BookReadAction {
  const audiobook = book.primaryFile?.bookType === 'AUDIOBOOK';
  if (bookPartlyRead(book)) {
    return audiobook ? 'continueListening' : 'continueReading';
  }
  return audiobook ? 'play' : 'read';
}
