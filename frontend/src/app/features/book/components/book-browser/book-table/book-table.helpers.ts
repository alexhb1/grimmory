import {BookMetadata} from '../../../model/book.model';

export const RATING_FIELDS = new Set(['amazonRating', 'goodreadsRating', 'hardcoverRating', 'ranobedbRating']);

export function isMetadataFullyLocked(metadata: BookMetadata): boolean {
  if (typeof metadata.allMetadataLocked === 'boolean') {
    return metadata.allMetadataLocked;
  }
  const lockedKeys = Object.keys(metadata).filter(key => key.endsWith('Locked'));
  if (lockedKeys.length === 0) return false;
  return lockedKeys.every(key => metadata[key] === true);
}
