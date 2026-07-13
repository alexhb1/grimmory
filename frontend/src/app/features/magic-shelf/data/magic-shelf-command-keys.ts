import {bookCommandKeys} from '../../book/data/book-command-keys';

export const magicShelfCommandKeys = {
  all: () => [...bookCommandKeys.all(), 'magic-shelf'] as const,
  save: () => [...magicShelfCommandKeys.all(), 'save'] as const,
  delete: () => [...magicShelfCommandKeys.all(), 'delete'] as const,
};

export const magicShelfCommandScopes = {
  definitions: {id: 'books.command.magic-shelf.definition'} as const,
};
