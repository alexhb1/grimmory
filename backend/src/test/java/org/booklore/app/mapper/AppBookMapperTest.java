package org.booklore.app.mapper;

import org.booklore.model.entity.BookEntity;
import org.booklore.model.entity.BookFileEntity;
import org.booklore.model.entity.BookMetadataEntity;
import org.booklore.model.entity.CategoryEntity;
import org.booklore.model.entity.LibraryEntity;
import org.booklore.model.entity.MoodEntity;
import org.booklore.model.entity.TagEntity;
import org.booklore.model.enums.BookFileType;
import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class AppBookMapperTest {

    private final AppBookMapper mapper = Mappers.getMapper(AppBookMapper.class);

    @Test
    void mapsPrimaryFileIdFromPrimaryBookFile() {
        BookFileEntity primaryFile = BookFileEntity.builder()
                .id(42L)
                .bookType(BookFileType.EPUB)
                .isBookFormat(true)
                .build();
        BookEntity book = BookEntity.builder()
                .bookFiles(List.of(primaryFile))
                .build();

        assertThat(mapper.mapPrimaryFileId(book)).isEqualTo(42L);
    }

    @Test
    void mapsNullPrimaryFileIdWhenBookHasNoFiles() {
        BookEntity book = BookEntity.builder()
                .bookFiles(List.of())
                .build();

        assertThat(mapper.mapPrimaryFileId(book)).isNull();
    }

    @Test
    void mapsBrowserMetadataFieldsToSummary() {
        BookMetadataEntity metadata = BookMetadataEntity.builder()
                .title("Test Book")
                .categories(Set.of(
                        CategoryEntity.builder().name("Space").build(),
                        CategoryEntity.builder().name("Adventure").build()))
                .tags(Set.of(
                        TagEntity.builder().name("space").build(),
                        TagEntity.builder().name("classic").build()))
                .moods(Set.of(
                        MoodEntity.builder().name("tense").build(),
                        MoodEntity.builder().name("bright").build()))
                .narrator("A Narrator")
                .lubimyczytacRating(4.1)
                .audibleRating(4.6)
                .audibleReviewCount(128)
                .build();
        BookEntity book = BookEntity.builder()
                .id(1L)
                .metadata(metadata)
                .library(LibraryEntity.builder().id(2L).build())
                .bookFiles(List.of())
                .build();

        var summary = mapper.toSummary(book, null);

        assertThat(summary.getCategories()).containsExactly("Adventure", "Space");
        assertThat(summary.getTags()).containsExactly("classic", "space");
        assertThat(summary.getMoods()).containsExactly("bright", "tense");
        assertThat(summary.getNarrator()).isEqualTo("A Narrator");
        assertThat(summary.getLubimyczytacRating()).isEqualTo(4.1);
        assertThat(summary.getAudibleRating()).isEqualTo(4.6);
        assertThat(summary.getAudibleReviewCount()).isEqualTo(128);
    }

    @Test
    void mapsSummarySafelyWhenMetadataIsNull() {
        BookEntity book = BookEntity.builder()
                .id(1L)
                .library(LibraryEntity.builder().id(2L).build())
                .bookFiles(List.of())
                .build();

        var summary = mapper.toSummary(book, null);

        assertThat(summary.getCategories()).isEmpty();
        assertThat(summary.getTags()).isEmpty();
        assertThat(summary.getMoods()).isEmpty();
        assertThat(summary.getNarrator()).isNull();
        assertThat(summary.getLubimyczytacRating()).isNull();
        assertThat(summary.getAudibleRating()).isNull();
        assertThat(summary.getAudibleReviewCount()).isNull();
        assertThat(mapper.mapCategoryNames(null)).isEmpty();
        assertThat(mapper.mapTagNames(null)).isEmpty();
        assertThat(mapper.mapMoodNames(null)).isEmpty();
    }

    @Test
    void mapsEmptyMetadataCollectionsToEmptyLists() {
        BookMetadataEntity metadata = BookMetadataEntity.builder()
                .title("Test Book")
                .categories(Set.of())
                .tags(Set.of())
                .moods(Set.of())
                .build();
        BookEntity book = BookEntity.builder()
                .id(1L)
                .metadata(metadata)
                .library(LibraryEntity.builder().id(2L).build())
                .bookFiles(List.of())
                .build();

        var summary = mapper.toSummary(book, null);

        assertThat(summary.getCategories()).isEmpty();
        assertThat(summary.getTags()).isEmpty();
        assertThat(summary.getMoods()).isEmpty();
        assertThat(summary.getNarrator()).isNull();
        assertThat(summary.getLubimyczytacRating()).isNull();
        assertThat(summary.getAudibleRating()).isNull();
        assertThat(summary.getAudibleReviewCount()).isNull();
        assertThat(mapper.mapCategoryNames(Set.of())).isEmpty();
        assertThat(mapper.mapTagNames(Set.of())).isEmpty();
        assertThat(mapper.mapMoodNames(Set.of())).isEmpty();
    }
}
