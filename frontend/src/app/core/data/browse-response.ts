import {
  BrowseFacetGroup,
  BrowseFacetResult,
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

interface RawBrowsePage<T> {
  content: T[];
  page: BrowsePageMetadata;
  links: RawLink[];
}

interface RawFacetLink extends RawLink {
  title: string;
  value: string;
  properties?: {numberOfItems?: number};
}

interface RawFacetGroup {
  metadata: {rel: string; key: string; title: string; min?: number; max?: number};
  links: RawFacetLink[];
}

interface RawFacetResponse {
  links: RawLink[];
  facets: RawFacetGroup[];
}

export function mapBrowsePage<T>(response: RawBrowsePage<T>): BrowsePage<T> {
  return {
    content: response.content,
    page: response.page,
    links: response.links.map(mapBrowseLink),
  };
}

export function mapBrowseFacetResult(response: RawFacetResponse): BrowseFacetResult {
  const facets: BrowseFacetGroup[] = [];
  const sortTokens: string[] = [];
  for (const group of response.facets) {
    if (group.metadata.rel === 'facet') {
      facets.push(mapBrowseFacetGroup(group));
    } else if (group.metadata.rel === 'sort') {
      sortTokens.push(...group.links.map(link => link.value));
    }
  }
  return {facets, sortTokens};
}

export function mapBrowseFacetPage(response: RawFacetResponse): BrowseFacetGroup {
  return {
    ...mapBrowseFacetGroup(response.facets[0]),
    complete: !response.links.some(link => normalizeRel(link.rel).includes('next')),
  };
}

function mapBrowseFacetGroup(group: RawFacetGroup): BrowseFacetGroup {
  return {
    key: group.metadata.key,
    title: group.metadata.title,
    values: group.links.map(mapBrowseFacetValue),
    min: group.metadata.min,
    max: group.metadata.max,
  };
}

function mapBrowseLink(raw: RawLink): BrowseLink {
  return {
    rel: normalizeRel(raw.rel),
    href: raw.href,
    type: raw.type,
  };
}

function mapBrowseFacetValue(raw: RawFacetLink): BrowseFacetValue {
  return {
    value: raw.value,
    title: raw.title,
    count: raw.properties?.numberOfItems ?? 0,
    selected: normalizeRel(raw.rel).includes('self'),
  };
}

function normalizeRel(rel: string | string[]): string[] {
  return Array.isArray(rel) ? rel : [rel];
}
