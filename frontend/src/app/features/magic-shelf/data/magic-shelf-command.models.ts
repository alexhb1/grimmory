import {
  ShelfIcon,
  ShelfVisibility,
} from '../../book/data/book-shelf-command.models';

export type MagicShelfFilterValue =
  | string
  | number
  | boolean
  | null
  | readonly MagicShelfFilterValue[]
  | {readonly [key: string]: MagicShelfFilterValue};

export interface MagicShelfRule {
  readonly field: string;
  readonly operator: string;
  readonly value?: MagicShelfFilterValue;
  readonly valueStart?: MagicShelfFilterValue;
  readonly valueEnd?: MagicShelfFilterValue;
}

export interface MagicShelfFilterGroup {
  readonly name: string;
  readonly type: 'group';
  readonly join: 'and' | 'or';
  readonly rules: readonly (MagicShelfRule | MagicShelfFilterGroup)[];
}

export interface MagicShelfDefinitionInput {
  readonly name: string;
  readonly icon: ShelfIcon | null;
  readonly visibility: ShelfVisibility;
  readonly filter: MagicShelfFilterGroup;
}

export interface MagicShelfDefinition extends MagicShelfDefinitionInput {
  readonly id: number;
}

export interface SaveMagicShelfVariables {
  readonly shelfId?: number;
  readonly definition: MagicShelfDefinitionInput;
}

export interface DeleteMagicShelfVariables {
  readonly shelfId: number;
}

export interface DeleteMagicShelfResult {
  readonly shelfId: number;
}
