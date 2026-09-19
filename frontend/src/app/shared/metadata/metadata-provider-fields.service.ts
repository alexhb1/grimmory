import {computed, inject, Injectable} from '@angular/core';
import {TranslocoService} from '@jsverse/transloco';

import {MetadataCatalogueService} from './metadata-catalogue.service';
import {providerFieldsOf} from './metadata-provider-fields';
import type {MetadataProviderFieldName} from './metadata-providers';

@Injectable({providedIn: 'root'})
export class MetadataProviderFieldsService {
  private readonly catalogue = inject(MetadataCatalogueService);
  private readonly t = inject(TranslocoService);

  readonly fields = computed(() => providerFieldsOf(this.catalogue.providers()));

  private readonly byName = computed(() => new Map(this.fields().map(field => [field.name, field])));

  label(name: MetadataProviderFieldName): string {
    const field = this.byName().get(name);
    if (!field) return name;
    return this.t.translate(field.labelKey, {provider: this.t.translate(field.providerLabelKey)});
  }
}
