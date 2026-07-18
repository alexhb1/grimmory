import {
  BrowseFacetGroup,
  BrowseFacetValue,
  BrowseLink,
  BrowsePage,
  BrowsePageMetadata,
} from './browse.models';

interface RawLink {
  rel: string | string[];
  href: string;
  type: string;
}

interface RawBrowsePage {
  content: unknown[];
  page: BrowsePageMetadata;
  links: RawLink[];
}

interface RawFacetLink extends RawLink {
  title: string;
  value: string;
  properties?: {numberOfItems?: number};
}

interface RawFacetGroup {
  metadata: {rel: string; key: string; title: string};
  links: RawFacetLink[];
}

interface RawFacetResponse {
  facets: RawFacetGroup[];
}

export function mapBrowsePage<T>(raw: unknown): BrowsePage<T> {
  const response = raw as RawBrowsePage;
  return {
    content: response.content as T[],
    page: response.page,
    links: response.links.map(mapBrowseLink),
  };
}

export function mapBrowseFacetGroups(raw: unknown): BrowseFacetGroup[] {
  const response = raw as RawFacetResponse;
  return response.facets.map(group => ({
    rel: group.metadata.rel,
    key: group.metadata.key,
    title: group.metadata.title,
    values: group.links.map(mapBrowseFacetValue),
  }));
}

function mapBrowseLink(raw: RawLink): BrowseLink {
  return {
    rel: normalizeRel(raw.rel),
    href: raw.href,
    type: raw.type,
  };
}

function mapBrowseFacetValue(raw: RawFacetLink): BrowseFacetValue {
  const count = raw.properties?.numberOfItems;
  return {
    value: raw.value,
    title: raw.title,
    selected: normalizeRel(raw.rel).includes('self'),
    ...(count == null ? {} : {count}),
  };
}

function normalizeRel(rel: string | string[]): string[] {
  return Array.isArray(rel) ? rel : [rel];
}
