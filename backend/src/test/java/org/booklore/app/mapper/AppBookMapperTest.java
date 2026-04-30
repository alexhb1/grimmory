package org.booklore.app.mapper;

import org.booklore.model.entity.BookEntity;
import org.booklore.model.entity.BookFileEntity;
import org.booklore.model.enums.BookFileType;
import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;

import java.util.List;

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
}
