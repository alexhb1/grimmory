package org.booklore.browse;

import org.booklore.exception.APIException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FacetSelectionTest {

    @Test
    void parsesAllBucketsAndSplitsOnTheFirstColon() {
        FacetSelection selection = FacetSelection.parse(
                List.of("genre:History:Modern", " "),
                List.of("author:Alice"),
                List.of("tag:Hidden"));

        assertThat(selection.any()).containsEntry("genre", List.of("History:Modern"));
        assertThat(selection.must()).containsEntry("author", List.of("Alice"));
        assertThat(selection.not()).containsEntry("tag", List.of("Hidden"));
        assertThat(selection.isEmpty()).isFalse();
    }

    @Test
    void nullAndBlankEntriesProduceAnEmptySelection() {
        assertThat(FacetSelection.parse(null, List.of(""), List.of(" ")).isEmpty()).isTrue();
    }

    @Test
    void malformedEntriesInEveryBucketUseTheInvalidFacetError() {
        assertInvalid(List.of("missing-colon"), null, null);
        assertInvalid(null, List.of(":missing-key"), null);
        assertInvalid(null, null, List.of("missing-value:"));
    }

    private void assertInvalid(List<String> any, List<String> must, List<String> not) {
        assertThatThrownBy(() -> FacetSelection.parse(any, must, not))
                .isInstanceOfSatisfying(APIException.class,
                        error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST))
                .hasMessageContaining("key:value");
    }
}
