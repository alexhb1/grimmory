import {bookCommandKeys} from './book-command-keys';

export const bookBackgroundSubmissionKeys = {
  all: () => [...bookCommandKeys.all(), 'background-submission'] as const,
  changeCovers: () => [...bookBackgroundSubmissionKeys.all(), 'change-covers'] as const,
};

export const bookBackgroundSubmissionScopes = {
  changeCovers: {id: 'books.command.background-submission.change-covers'} as const,
};
