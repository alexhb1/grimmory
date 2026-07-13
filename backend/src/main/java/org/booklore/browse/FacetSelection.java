package org.booklore.browse;

import org.booklore.exception.ApiError;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public record FacetSelection(
        Map<String, List<String>> any,
        Map<String, List<String>> must,
        Map<String, List<String>> not
) {

    public FacetSelection {
        any = immutableCopy(any);
        must = immutableCopy(must);
        not = immutableCopy(not);
    }

    public static FacetSelection parse(List<String> facet, List<String> facetMust, List<String> facetNot) {
        return new FacetSelection(parseBucket(facet), parseBucket(facetMust), parseBucket(facetNot));
    }

    public static FacetSelection empty() {
        return new FacetSelection(Map.of(), Map.of(), Map.of());
    }

    public boolean isEmpty() {
        return any.isEmpty() && must.isEmpty() && not.isEmpty();
    }

    public Set<String> keys() {
        Set<String> keys = new LinkedHashSet<>(any.keySet());
        keys.addAll(must.keySet());
        keys.addAll(not.keySet());
        return Collections.unmodifiableSet(keys);
    }

    private static Map<String, List<String>> parseBucket(List<String> entries) {
        Map<String, List<String>> bucket = new LinkedHashMap<>();
        if (entries == null) {
            return bucket;
        }
        for (String entry : entries) {
            if (entry == null || entry.isBlank()) {
                continue;
            }
            int colon = entry.indexOf(':');
            if (colon <= 0 || colon == entry.length() - 1) {
                throw ApiError.INVALID_FACET.createException("Facet must be in key:value form: " + entry);
            }
            bucket.computeIfAbsent(entry.substring(0, colon), key -> new ArrayList<>())
                    .add(entry.substring(colon + 1));
        }
        return bucket;
    }

    private static Map<String, List<String>> immutableCopy(Map<String, List<String>> bucket) {
        Map<String, List<String>> copy = new LinkedHashMap<>();
        bucket.forEach((key, values) -> copy.put(key, List.copyOf(values)));
        return Collections.unmodifiableMap(copy);
    }
}
