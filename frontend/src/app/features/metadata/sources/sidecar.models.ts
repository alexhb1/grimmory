interface SidecarCoverInfo {
  source: string;
  path: string;
}

interface SidecarSeries {
  name?: string;
  number?: number;
  total?: number;
}

interface SidecarIdentifiers {
  asin?: string;
  goodreadsId?: string;
  googleId?: string;
  hardcoverId?: string;
  hardcoverBookId?: string;
  comicvineId?: string;
  lubimyczytacId?: string;
  ranobedbId?: string;
  audibleId?: string;
  applebooksId?: string;
  openlibraryId?: string;
}

interface SidecarRating {
  average?: number;
  count?: number;
}

interface SidecarRatings {
  amazon?: SidecarRating;
  goodreads?: SidecarRating;
  hardcover?: SidecarRating;
  lubimyczytac?: SidecarRating;
  ranobedb?: SidecarRating;
  audible?: SidecarRating;
  applebooks?: SidecarRating;
}

interface SidecarBookMetadata {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  isbn10?: string;
  isbn13?: string;
  language?: string;
  pageCount?: number;
  categories?: string[];
  moods?: string[];
  tags?: string[];
  series?: SidecarSeries;
  identifiers?: SidecarIdentifiers;
  ratings?: SidecarRatings;
  ageRating?: number;
  contentRating?: string;
  narrator?: string;
  abridged?: boolean;
}

export interface SidecarMetadata {
  version: string;
  generatedAt: string;
  generatedBy: string;
  metadata: SidecarBookMetadata;
  cover?: SidecarCoverInfo;
}

export type SidecarSyncStatus = 'IN_SYNC' | 'OUTDATED' | 'MISSING' | 'CONFLICT' | 'NOT_APPLICABLE';
