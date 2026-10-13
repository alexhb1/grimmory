package org.booklore.stats;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Pattern;
import lombok.RequiredArgsConstructor;
import org.booklore.stats.StatsResponses.Distribution;
import org.booklore.stats.StatsResponses.Rows;
import org.booklore.stats.StatsResponses.TopName;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Validated
@Tag(name = "Stats", description = "Statistics over the current user's books and reading sessions, filtered like the book browser")
@RequestMapping("/api/v1/stats/library")
@PreAuthorize("@securityUtil.canAccessLibraryStats() or @securityUtil.isAdmin()")
@RestController
@RequiredArgsConstructor
public class LibraryStatsController {

    private final StatsService statsService;

    @Operation(summary = "Count books per library value", description = "Matching books per value of one library dimension. "
            + "A null value counts the books where it is unknown.")
    @ApiResponse(responseCode = "200", description = "Distribution returned successfully")
    @GetMapping("/distribution/{dimension}")
    public ResponseEntity<Distribution> getLibraryDistribution(
            @ParameterObject @ModelAttribute StatsQuery query,
            @Parameter(description = "format, language, metadata_score, page_band or publication_year")
            @PathVariable @Pattern(regexp = "format|language|metadata_score|page_band|publication_year") String dimension) {
        return ResponseEntity.ok(statsService.distribution(query, dimension));
    }

    @Operation(summary = "Get the top names", description = "The 10 authors, genres, series, publishers, tags or moods with the most matching books, "
            + "the most read, or the highest mean personal rating from at least two rated books, in that order, each with its books per status.")
    @ApiResponse(responseCode = "200", description = "Top names returned successfully")
    @GetMapping("/top/{kind}")
    public ResponseEntity<Rows<TopName>> getTop(@ParameterObject @ModelAttribute StatsQuery query,
                                                @Parameter(description = "author, genre, series, publisher, tag or mood")
                                                @PathVariable @Pattern(regexp = "author|genre|series|publisher|tag|mood") String kind,
                                                @Parameter(description = "books, read or rating; default books")
                                                @RequestParam(defaultValue = "books") @Pattern(regexp = "books|read|rating") String by) {
        return ResponseEntity.ok(statsService.top(query, kind, by));
    }
}
