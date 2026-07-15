package org.booklore.service.browse;

import org.booklore.browse.FacetSelection;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class BrowseParamsTest {

    @Test
    void preservesEveryFacetSelectionBucket() {
        FacetSelection facets = FacetSelection.parse(
                List.of("genre:Science Fiction"),
                List.of("author:Alice"),
                List.of("tag:Hidden"));

        assertThat(BrowseParams.preserved(facets, "or", "space opera")).isEqualTo(
                "facet=genre%3AScience+Fiction"
                        + "&facet_must=author%3AAlice"
                        + "&facet_not=tag%3AHidden"
                        + "&facet_logic=or"
                        + "&query=space+opera");
    }
}
