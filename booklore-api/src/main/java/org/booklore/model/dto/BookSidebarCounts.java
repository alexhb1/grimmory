package org.booklore.model.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Builder
@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class BookSidebarCounts {
    private long totalCount;
    private long unshelvedCount;
    private Map<Long, Long> libraryCounts;
    private Map<Long, Long> shelfCounts;
}
