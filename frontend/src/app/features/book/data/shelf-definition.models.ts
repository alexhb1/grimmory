export type ShelfVisibility = 'private' | 'public';
export type ShelfIconType = 'LUCIDE' | 'CUSTOM_SVG';

export interface ShelfIcon {
  readonly value: string;
  readonly type: ShelfIconType;
}

export interface ShelfDefinitionIcon {
  readonly value: string;
  readonly type: ShelfIconType | (string & {}) | null;
}

export interface ShelfDefinitionInput {
  readonly name: string;
  readonly icon: ShelfIcon | null;
  readonly visibility: ShelfVisibility;
}

export interface ShelfDefinition {
  readonly id: number;
  readonly userId: number;
  readonly name: string;
  readonly icon: ShelfDefinitionIcon | null;
  readonly visibility: ShelfVisibility;
  readonly bookCount: number;
}
