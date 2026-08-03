import {type ParamMap} from '@angular/router';

import {
  type EntityViewPreference,
  type EntityViewPreferenceOverride,
  type EntityViewPreferences,
} from './user.service';

export type EntityViewPreferenceContext = Pick<EntityViewPreferenceOverride, 'entityType' | 'entityId'>;

export function entityViewPreferenceContext(paramMap: ParamMap): EntityViewPreferenceContext | null {
  const candidates = [
    {param: 'libraryId', entityType: 'LIBRARY'},
    {param: 'shelfId', entityType: 'SHELF'},
    {param: 'magicShelfId', entityType: 'MAGIC_SHELF'},
  ] as const;

  for (const candidate of candidates) {
    const entityId = Number(paramMap.get(candidate.param));
    if (Number.isSafeInteger(entityId) && entityId > 0) {
      return {entityType: candidate.entityType, entityId};
    }
  }
  return null;
}

export function findEntityViewPreferenceOverride(
  preferences: EntityViewPreferences | undefined,
  context: EntityViewPreferenceContext,
): EntityViewPreference | undefined {
  return preferences?.overrides.find(override =>
    override.entityType === context.entityType && override.entityId === context.entityId,
  )?.preferences;
}

export function resolveEntityViewPreference(
  preferences: EntityViewPreferences | undefined,
  context: EntityViewPreferenceContext | null,
): EntityViewPreference | undefined {
  return context
    ? findEntityViewPreferenceOverride(preferences, context) ?? preferences?.global
    : preferences?.global;
}

export function upsertEntityViewPreference(
  preferences: EntityViewPreferences,
  context: EntityViewPreferenceContext | null,
  patch: Partial<EntityViewPreference>,
): EntityViewPreferences {
  const next = structuredClone(preferences);
  if (context === null) {
    next.global = {...next.global, ...patch};
    return next;
  }
  const override = next.overrides.find(candidate =>
    candidate.entityType === context.entityType && candidate.entityId === context.entityId);
  if (override) {
    override.preferences = {...override.preferences, ...patch};
  } else {
    next.overrides.push({...context, preferences: {...next.global, ...patch}});
  }
  return next;
}
