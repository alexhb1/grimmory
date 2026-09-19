import type {MetadataProviderDescriptor, MetadataProviderFieldName, MetadataProviderId} from './metadata-providers';

export type MetadataProviderFieldRole = 'id' | 'rating' | 'reviewCount';

export interface MetadataProviderField {
  readonly name: MetadataProviderFieldName;
  readonly provider: MetadataProviderId;
  readonly providerLabelKey: string;
  readonly role: MetadataProviderFieldRole;
  readonly lockName: `${MetadataProviderFieldName}Locked`;
  readonly valueType: 'string' | 'number';
  readonly labelKey: string;
}

export function providerFieldsOf(
  providers: readonly MetadataProviderDescriptor[],
): readonly MetadataProviderField[] {
  return providers.flatMap(provider => {
    const book = provider.book;
    if (!book) return [];
    const byRole = [
      ...book.ids.map(name => [name, 'id'] as const),
      ...(book.rating ? [[book.rating, 'rating'] as const] : []),
      ...(book.reviewCount ? [[book.reviewCount, 'reviewCount'] as const] : []),
    ];
    return byRole.map(([name, role]): MetadataProviderField => ({
      name,
      provider: provider.id,
      providerLabelKey: provider.labelKey,
      role,
      lockName: `${name}Locked`,
      valueType: role === 'id' ? 'string' : 'number',
      labelKey: book.labelKeys?.[name] ?? `metadata.providerFields.${role}`,
    }));
  });
}
