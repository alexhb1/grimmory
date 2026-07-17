import {ShelfDefinitionInput} from './shelf-definition.models';
import {BookShelf} from './book-response.models';

export interface UpdatedBookShelves {
  readonly bookId: number;
  readonly shelves: readonly BookShelf[];
}

export interface UpdateBookShelfMembershipVariables {
  readonly bookIds: readonly number[];
  readonly assignShelfIds: readonly number[];
  readonly unassignShelfIds: readonly number[];
}

export interface UpdateBookShelfMembershipResult {
  readonly confirmedBookIds: readonly number[];
  readonly updatedBookShelves: readonly UpdatedBookShelves[];
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
