package org.booklore.service.browse;

import org.booklore.browse.FacetSelection;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

final class BrowseParams {

    private BrowseParams() {
    }

    static String preserved(FacetSelection facets, String facetLogic, String query) {
        List<String> parts = new ArrayList<>();
        append(parts, "facet", facets.any());
        append(parts, "facet_must", facets.must());
        append(parts, "facet_not", facets.not());
        if (facetLogic != null && !facetLogic.isBlank()) {
            parts.add("facet_logic=" + encode(facetLogic));
        }
        if (query != null && !query.isBlank()) {
            parts.add("query=" + encode(query));
        }
        return String.join("&", parts);
    }

    private static void append(List<String> parts, String parameter, Map<String, List<String>> bucket) {
        bucket.forEach((key, values) -> values.forEach(value ->
                parts.add(parameter + "=" + encode(key + ":" + value))));
    }

    static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
