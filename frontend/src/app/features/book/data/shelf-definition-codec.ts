import {
  isNonNegativeSafeInteger,
  isPositiveSafeInteger,
  isRecord,
} from './json-guards';
import {
  ShelfDefinition,
  ShelfDefinitionIcon,
  ShelfDefinitionInput,
  ShelfIcon,
} from './shelf-definition.models';

export function normalizeShelfDefinition(definition: ShelfDefinitionInput): ShelfDefinitionInput {
  if (!isRecord(definition)) {
    throw new Error('A shelf definition is required.');
  }
  const name = requiredTrimmedString(definition.name, 'Shelf name must not be blank.');
  const visibility = definition.visibility;
  if (visibility !== 'private' && visibility !== 'public') {
    throw new Error(`Unsupported shelf visibility: ${String(visibility)}`);
  }

  return {
    name,
    icon: normalizeIcon(definition.icon),
    visibility,
  };
}
export function encodeShelfDefinition(definition: ShelfDefinitionInput) {
  return {
    name: definition.name,
    icon: definition.icon?.value ?? null,
    iconType: definition.icon?.type ?? null,
    publicShelf: definition.visibility === 'public',
  };
}

export function decodeShelfDefinitions(response: unknown): ShelfDefinition[] {
  if (!Array.isArray(response)) {
    throw new Error('Invalid shelf definitions response.');
  }
  return response.map(decodeShelfDefinition);
}

export function decodeShelfDefinition(response: unknown): ShelfDefinition {
  if (!isRecord(response)) {
    throw new Error('Invalid shelf definition response.');
  }
  const id = response['id'];
  const userId = response['userId'];
  const name = response['name'];
  const publicShelf = response['publicShelf'];
  const bookCount = response['bookCount'];
  if (
    !isPositiveSafeInteger(id)
    || !isPositiveSafeInteger(userId)
    || typeof name !== 'string'
    || name.trim().length === 0
    || typeof publicShelf !== 'boolean'
    || !isNonNegativeSafeInteger(bookCount)
  ) {
    throw new Error('Invalid shelf definition response.');
  }

  return {
    id,
    userId,
    name,
    icon: decodeIcon(response['icon'], response['iconType']),
    visibility: publicShelf ? 'public' : 'private',
    bookCount,
  };
}

function normalizeIcon(icon: ShelfIcon | null): ShelfIcon | null {
  if (icon === null) {
    return null;
  }
  if (!isRecord(icon)) {
    throw new Error('Shelf icon must be an icon or null.');
  }
  const value = requiredTrimmedString(icon.value, 'Shelf icon value must not be blank.');
  if (icon.type !== 'LUCIDE' && icon.type !== 'CUSTOM_SVG') {
    throw new Error(`Unsupported shelf icon type: ${String(icon.type)}`);
  }
  return {value, type: icon.type};
}

function decodeIcon(value: unknown, type: unknown): ShelfDefinitionIcon | null {
  if (value === undefined || value === null) {
    if (type !== undefined && type !== null) {
      throw new Error('Invalid shelf definition response.');
    }
    return null;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Invalid shelf definition response.');
  }
  if (type !== undefined && type !== null && typeof type !== 'string') {
    throw new Error('Invalid shelf definition response.');
  }
  return {
    value,
    type: type ?? null,
  };
}

function requiredTrimmedString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(message);
  }
  return value.trim();
}
