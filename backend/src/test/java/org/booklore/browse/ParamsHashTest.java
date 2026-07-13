package org.booklore.browse;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ParamsHashTest {

    private FacetSelection selection(Map<String, List<String>> any) {
        return new FacetSelection(any, Map.of(), Map.of());
    }

    @Test
    void isTwelveCharacters() {
        assertThat(ParamsHash.compute("q", FacetSelection.empty(), FacetLogic.AND)).hasSize(12);
    }

    @Test
    void isDeterministic() {
        Map<String, List<String>> facets = Map.of("author", List.of("Tolkien"));
        assertThat(ParamsHash.compute("hobbit", selection(facets), FacetLogic.AND))
                .isEqualTo(ParamsHash.compute("hobbit", selection(facets), FacetLogic.AND));
    }

    @Test
    void isIndependentOfFacetKeyOrder() {
        String a = ParamsHash.compute(
                null, selection(Map.of("author", List.of("A"), "genre", List.of("G"))), FacetLogic.AND);
        String b = ParamsHash.compute(
                null, selection(Map.of("genre", List.of("G"), "author", List.of("A"))), FacetLogic.AND);
        assertThat(a).isEqualTo(b);
    }

    @Test
    void isIndependentOfValueOrderWithinAFacet() {
        String a = ParamsHash.compute(null, selection(Map.of("author", List.of("A", "B"))), FacetLogic.AND);
        String b = ParamsHash.compute(null, selection(Map.of("author", List.of("B", "A"))), FacetLogic.AND);
        assertThat(a).isEqualTo(b);
    }

    @Test
    void queryChangesHash() {
        assertThat(ParamsHash.compute("one", FacetSelection.empty(), FacetLogic.AND))
                .isNotEqualTo(ParamsHash.compute("two", FacetSelection.empty(), FacetLogic.AND));
    }

    @Test
    void facetLogicChangesHash() {
        Map<String, List<String>> facets = Map.of("author", List.of("A"));
        assertThat(ParamsHash.compute(null, selection(facets), FacetLogic.AND))
                .isNotEqualTo(ParamsHash.compute(null, selection(facets), FacetLogic.OR));
    }

    @Test
    void facetSelectionChangesHash() {
        assertThat(ParamsHash.compute(null, selection(Map.of("author", List.of("A"))), FacetLogic.AND))
                .isNotEqualTo(ParamsHash.compute(null, selection(Map.of("author", List.of("B"))), FacetLogic.AND));
    }

    @Test
    void nullQueryAndEmptyFacetsAreStable() {
        assertThat(ParamsHash.compute(null, FacetSelection.empty(), FacetLogic.AND))
                .isEqualTo(ParamsHash.compute(null, FacetSelection.empty(), FacetLogic.AND));
    }

    @Test
    void valuesWithDelimitersDoNotCollide() {
        assertThat(ParamsHash.compute(null, selection(Map.of("author", List.of("A,B"))), FacetLogic.AND))
                .isNotEqualTo(ParamsHash.compute(
                        null, selection(Map.of("author", List.of("A", "B"))), FacetLogic.AND));
    }

    @Test
    void sameValueInDifferentBucketsProducesDifferentHashes() {
        Map<String, List<String>> value = Map.of("genre", List.of("History"));
        FacetSelection any = new FacetSelection(value, Map.of(), Map.of());
        FacetSelection must = new FacetSelection(Map.of(), value, Map.of());
        FacetSelection not = new FacetSelection(Map.of(), Map.of(), value);

        assertThat(List.of(
                ParamsHash.compute(null, any, FacetLogic.AND),
                ParamsHash.compute(null, must, FacetLogic.AND),
                ParamsHash.compute(null, not, FacetLogic.AND)))
                .doesNotHaveDuplicates();
    }

    @Test
    void mustAndNotBucketsAreOrderInvariant() {
        FacetSelection first = new FacetSelection(
                Map.of(),
                Map.of("author", List.of("B", "A"), "genre", List.of("History")),
                Map.of("tag", List.of("Y", "X"), "mood", List.of("Dark")));
        FacetSelection second = new FacetSelection(
                Map.of(),
                Map.of("genre", List.of("History"), "author", List.of("A", "B")),
                Map.of("mood", List.of("Dark"), "tag", List.of("X", "Y")));

        assertThat(ParamsHash.compute(null, first, FacetLogic.AND))
                .isEqualTo(ParamsHash.compute(null, second, FacetLogic.AND));
    }
}
