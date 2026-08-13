import {CustomFont} from '../model/custom-font.model';

/**
 * Font dropdown item for epub-reader component (Optimus UI Select format)
 */
export interface FontDropdownItem {
  label: string;
  value: string | null;
  disabled?: boolean;
}

/**
 * Font dropdown item for epub-reader-preferences component
 */
export interface FontPreferenceItem {
  name: string;
  displayName: string;
  key: string | null;
}

const MAX_FONT_DISPLAY_LENGTH = 12;

/**
 * Adds custom fonts to a dropdown array with a separator.
 * Removes any existing separator before adding to prevent duplicates.
 */
export function addCustomFontsToDropdown(
  fonts: CustomFont[],
  targetArray: FontDropdownItem[],
  format: 'select'
): void;
export function addCustomFontsToDropdown(
  fonts: CustomFont[],
  targetArray: FontPreferenceItem[],
  format: 'preference'
): void;
export function addCustomFontsToDropdown(
  fonts: CustomFont[],
  targetArray: (FontDropdownItem | FontPreferenceItem)[],
  format: 'select' | 'preference'
): void {
  if (fonts.length === 0) {
    return;
  }

  if (format === 'select') {
    const separatorIndex = targetArray.findIndex(item => 'value' in item && item.value === 'separator');
    if (separatorIndex !== -1) {
      targetArray.splice(separatorIndex, 1);
    }

    fonts.forEach(font => {
      targetArray.push({
        label: font.fontName,
        value: `custom:${font.id}`
      });
    });
  } else {
    const separatorIndex = targetArray.findIndex(item => 'key' in item && item.key === 'separator');
    if (separatorIndex !== -1) {
      targetArray.splice(separatorIndex, 1);
    }

    fonts.forEach(font => {
      targetArray.push({
        name: font.fontName,
        displayName: font.fontName.substring(0, MAX_FONT_DISPLAY_LENGTH),
        key: `custom:${font.id}`
      });
    });
  }
}
