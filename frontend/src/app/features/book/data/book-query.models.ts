import {InfiniteData} from '@tanstack/angular-query-experimental';

import {BookSummary} from './book-response.models';

export interface PageLink {
  rel: string[];
  href: string;
  type: string;
}

export interface PageMetadata {
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
  cursor?: string;
}

export interface PageResponse<T> {
  content: T[];
  page: PageMetadata;
  links: PageLink[];
}

export type BookPage = PageResponse<BookSummary>;

export interface FacetLinkPropertiesResponse {
  numberOfItems?: number;
}

export interface FacetLinkResponse {
  rel: string;
  href: string;
  type: string;
  title: string;
  value: string;
  properties?: FacetLinkPropertiesResponse;
}

export interface FacetGroupMetadataResponse {
  rel: string;
  key: string;
  title: string;
}

export interface FacetGroupResponse {
  metadata: FacetGroupMetadataResponse;
  links: FacetLinkResponse[];
}

export interface FacetGroupsResponse {
  facets: FacetGroupResponse[];
}

export interface BookFacetValue {
  value: string;
  title: string;
  count?: number;
}

export interface BookFacetGroup {
  rel: string;
  key: string;
  title: string;
  values: BookFacetValue[];
}

export function findPageLink(page: PageResponse<unknown>, rel: string): PageLink | undefined {
  return page.links.find(link => link.rel.includes(rel));
}

export function decodeFacetGroups(response: FacetGroupsResponse): BookFacetGroup[] {
  return response.facets.map(group => ({
    rel: group.metadata.rel,
    key: group.metadata.key,
    title: group.metadata.title,
    values: group.links.map(link => ({
      value: link.value,
      title: link.title,
      ...(link.properties?.numberOfItems == null
        ? {}
        : {count: link.properties.numberOfItems}),
    })),
  }));
}

export function flattenBookPages(
  data: InfiniteData<BookPage, string | null> | undefined,
): BookSummary[] {
  return data?.pages.flatMap(page => page.content) ?? [];
}

export function totalBooks(
  data: InfiniteData<BookPage, string | null> | undefined,
): number {
  return data?.pages[0]?.page.totalElements ?? 0;
}
