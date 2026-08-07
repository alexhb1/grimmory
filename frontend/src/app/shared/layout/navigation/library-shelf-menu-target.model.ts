export type LibraryShelfMenuTarget =
  | {type: 'library'; entity: {id: number; name: string}}
  | {type: 'shelf'; entity: {id: number; name: string; userId?: number}}
  | {
      type: 'magicShelf';
      entity: {id: number; name: string; filterJson: string; isPublic?: boolean};
    };
