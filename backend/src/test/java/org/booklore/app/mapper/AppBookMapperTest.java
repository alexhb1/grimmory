package org.booklore.app.mapper;

import org.booklore.app.dto.AppBookDetail;
import org.booklore.model.entity.UserBookFileProgressEntity;
import org.booklore.model.entity.UserBookProgressEntity;
import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class AppBookMapperTest {

    private final AppBookMapper mapper = Mappers.getMapper(AppBookMapper.class);

    @Test
    void mapEpubProgress_includesHrefOnlyProgressAndChapterPercent() {
        Instant lastReadTime = Instant.parse("2025-06-15T12:00:00Z");

        UserBookProgressEntity progress = new UserBookProgressEntity();
        progress.setEpubProgress(null);
        progress.setEpubProgressHref("OEBPS/chapter3.xhtml");
        progress.setEpubProgressPercent(55f);
        progress.setLastReadTime(lastReadTime);

        UserBookFileProgressEntity primaryFileProgress = new UserBookFileProgressEntity();
        primaryFileProgress.setContentSourceProgressPercent(23f);

        AppBookDetail.EpubProgress mapped = mapper.mapEpubProgress(progress, primaryFileProgress);

        assertThat(mapped).isNotNull();
        assertThat(mapped.getCfi()).isNull();
        assertThat(mapped.getHref()).isEqualTo("OEBPS/chapter3.xhtml");
        assertThat(mapped.getContentSourceProgressPercent()).isEqualTo(23f);
        assertThat(mapped.getPercentage()).isEqualTo(55f);
        assertThat(mapped.getUpdatedAt()).isEqualTo(lastReadTime);
    }
}
