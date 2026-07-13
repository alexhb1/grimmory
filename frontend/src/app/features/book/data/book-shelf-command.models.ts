export interface UpdateBookShelfMembershipVariables {
  readonly bookIds: readonly number[];
  readonly assignShelfIds: readonly number[];
  readonly unassignShelfIds: readonly number[];
}

export interface UpdateBookShelfMembershipResult {
  readonly confirmedBookIds: readonly number[];
  readonly assignedShelfIds: readonly number[];
  readonly unassignedShelfIds: readonly number[];
}

export type ShelfVisibility = 'private' | 'public';
export type ShelfIconType = 'LUCIDE' | 'CUSTOM_SVG';

export interface ShelfIcon {
  readonly value: string;
  readonly type: ShelfIconType;
}

export interface ShelfDefinitionInput {
  readonly name: string;
  readonly icon: ShelfIcon | null;
  readonly visibility: ShelfVisibility;
}

export interface ShelfDefinition extends ShelfDefinitionInput {
  readonly id: number;
  readonly bookCount?: number;
}

export interface CreateShelfVariables {
  readonly definition: ShelfDefinitionInput;
}

export interface UpdateShelfVariables {
  readonly shelfId: number;
  readonly definition: ShelfDefinitionInput;
}

export interface DeleteShelfVariables {
  readonly shelfId: number;
}

export interface DeleteShelfResult {
  readonly shelfId: number;
}
