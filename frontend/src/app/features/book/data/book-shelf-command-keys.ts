import {bookCommandKeys} from './book-command-keys';

export const bookShelfCommandKeys = {
  all: () => [...bookCommandKeys.all(), 'shelf'] as const,
  updateMembership: () => [...bookShelfCommandKeys.all(), 'update-membership'] as const,
  definitions: () => [...bookShelfCommandKeys.all(), 'definition'] as const,
  create: () => [...bookShelfCommandKeys.definitions(), 'create'] as const,
  update: () => [...bookShelfCommandKeys.definitions(), 'update'] as const,
  delete: () => [...bookShelfCommandKeys.definitions(), 'delete'] as const,
};

export const bookShelfCommandScopes = {
  regularShelves: {id: 'books.command.shelf'} as const,
};
