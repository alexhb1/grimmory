import {
  NormalizedBookBatchParams,
  NormalizedBookFacetParams,
  NormalizedBookIdsParams,
  NormalizedBookPageAtParams,
  NormalizedBookPageParams,
} from './book-query-params';

export const bookQueryKeys = {
  all: () => ['books', 'query'] as const,
  collections: () => [...bookQueryKeys.all(), 'collection'] as const,
  boundedPages: () => [...bookQueryKeys.collections(), 'page', 'bounded'] as const,
  boundedPage: (params: NormalizedBookPageParams) =>
    [...bookQueryKeys.boundedPages(), params] as const,
  infinitePages: () => [...bookQueryKeys.collections(), 'page', 'infinite'] as const,
  infinitePage: (params: NormalizedBookPageParams) =>
    [...bookQueryKeys.infinitePages(), params] as const,
  windowedPages: () => [...bookQueryKeys.collections(), 'page', 'windowed'] as const,
  windowedPage: (params: NormalizedBookPageAtParams) =>
    [...bookQueryKeys.windowedPages(), params] as const,
  facetQueries: () => [...bookQueryKeys.collections(), 'facets'] as const,
  facets: (params: NormalizedBookFacetParams) =>
    [...bookQueryKeys.facetQueries(), params] as const,
  idQueries: () => [...bookQueryKeys.collections(), 'ids'] as const,
  ids: (params: NormalizedBookIdsParams) =>
    [...bookQueryKeys.idQueries(), params] as const,
  details: () => [...bookQueryKeys.all(), 'detail'] as const,
  detailQueries: (bookId: number) =>
    [...bookQueryKeys.details(), bookId] as const,
  detail: (bookId: number, withDescription: boolean) =>
    [...bookQueryKeys.detailQueries(bookId), {withDescription}] as const,
  batches: () => [...bookQueryKeys.all(), 'batch'] as const,
  batch: (params: NormalizedBookBatchParams) =>
    [...bookQueryKeys.batches(), params] as const,
  recommendations: () => [...bookQueryKeys.all(), 'recommendation'] as const,
  recommendationQueries: (bookId: number) =>
    [...bookQueryKeys.recommendations(), bookId] as const,
  recommendation: (bookId: number, limit: number) =>
    [...bookQueryKeys.recommendationQueries(bookId), {limit}] as const,
};
