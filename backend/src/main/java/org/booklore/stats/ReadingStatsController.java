package org.booklore.stats;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import lombok.RequiredArgsConstructor;
import org.booklore.stats.StatsResponses.ActivityMonth;
import org.booklore.stats.StatsResponses.BookFlow;
import org.booklore.stats.StatsResponses.Days;
import org.booklore.stats.StatsResponses.Distribution;
import org.booklore.stats.StatsResponses.EraCell;
import org.booklore.stats.StatsResponses.FinishedBook;
import org.booklore.stats.StatsResponses.GenreTime;
import org.booklore.stats.StatsResponses.LengthCell;
import org.booklore.stats.StatsResponses.ProfileRow;
import org.booklore.stats.StatsResponses.Rows;
import org.booklore.stats.StatsResponses.SeriesPage;
import org.booklore.stats.StatsResponses.SeriesSummary;
import org.booklore.stats.StatsResponses.Slots;
import org.booklore.stats.StatsResponses.TasteCell;
import org.booklore.stats.StatsResponses.Week;
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
@RequestMapping("/api/v1/stats/reading")
@PreAuthorize("@securityUtil.canAccessUserStats() or @securityUtil.isAdmin()")
@RestController
@RequiredArgsConstructor
public class ReadingStatsController {

    private final StatsService statsService;

    @Operation(summary = "Count books per reading value", description = "Matching books per value of one reading dimension: status, rating, "
            + "or stopped, the progress of the books not being read or reread now. A null value counts the books where it is unknown.")
    @ApiResponse(responseCode = "200", description = "Distribution returned successfully")
    @GetMapping("/distribution/{dimension}")
    public ResponseEntity<Distribution> getReadingDistribution(
            @ParameterObject @ModelAttribute StatsQuery query,
            @Parameter(description = "status, rating or stopped") @PathVariable @Pattern(regexp = "status|rating|stopped") String dimension) {
        return ResponseEntity.ok(statsService.distribution(query, dimension));
    }

    @Operation(summary = "Count rated books by length", description = "Rated books with a known page count, per page band and rating.")
    @ApiResponse(responseCode = "200", description = "Cells returned successfully")
    @GetMapping("/length")
    public ResponseEntity<Rows<LengthCell>> getLength(@ParameterObject @ModelAttribute StatsQuery query) {
        return ResponseEntity.ok(statsService.length(query));
    }

    @Operation(summary = "Compare ratings with outside ratings", description = "Books with a personal and an outside rating, per outside rating to the "
            + "nearest half star and rating, with the summed personal minus outside rating in stars.")
    @ApiResponse(responseCode = "200", description = "Cells returned successfully")
    @GetMapping("/taste")
    public ResponseEntity<Rows<TasteCell>> getTaste(@ParameterObject @ModelAttribute StatsQuery query) {
        return ResponseEntity.ok(statsService.taste(query));
    }

    @Operation(summary = "Count rated books by publication decade", description = "Rated books published since 1900, per decade and rating.")
    @ApiResponse(responseCode = "200", description = "Cells returned successfully")
    @GetMapping("/era")
    public ResponseEntity<Rows<EraCell>> getEra(@ParameterObject @ModelAttribute StatsQuery query) {
        return ResponseEntity.ok(statsService.era(query));
    }

    @Operation(summary = "Get the book flow", description = "Matching books by the year they were added and status group, then by status group and rating level.")
    @ApiResponse(responseCode = "200", description = "Flow returned successfully")
    @GetMapping("/flow")
    public ResponseEntity<BookFlow> getBookFlow(@ParameterObject @ModelAttribute StatsQuery query) {
        return ResponseEntity.ok(statsService.bookFlow(query));
    }

    @Operation(summary = "Get monthly activity", description = "Matching books added and finished per month, with finished pages and the change in the backlog. "
            + "A book joins the backlog when added and leaves when finished; one finished before it was added never joins.")
    @ApiResponse(responseCode = "200", description = "Activity returned successfully")
    @GetMapping("/activity")
    public ResponseEntity<Rows<ActivityMonth>> getActivity(@ParameterObject @ModelAttribute StatsQuery query) {
        return ResponseEntity.ok(statsService.activity(query));
    }

    @Operation(summary = "Get the series summary", description = "The 8 series the chart draws, those being read first, how many series the matching books "
            + "belong to, their mean completion, and how many are completed, in progress and not started.")
    @ApiResponse(responseCode = "200", description = "Series summary returned successfully")
    @GetMapping("/series/summary")
    public ResponseEntity<SeriesSummary> getSeriesSummary(@ParameterObject @ModelAttribute StatsQuery query) {
        return ResponseEntity.ok(statsService.seriesSummary(query));
    }

    @Operation(summary = "Get a page of series", description = "10 series among the matching books whose name contains the search and that are in the state, "
            + "in the requested order, with how many match.")
    @ApiResponse(responseCode = "200", description = "Series returned successfully")
    @GetMapping("/series")
    public ResponseEntity<SeriesPage> getSeries(
            @ParameterObject @ModelAttribute StatsQuery query,
            @Parameter(description = "Keep series whose name contains this text") @RequestParam(required = false) String search,
            @Parameter(description = "in-progress, paused, not-started, completed or abandoned; default any")
            @RequestParam(required = false) @Pattern(regexp = "in-progress|paused|not-started|completed|abandoned") String state,
            @Parameter(description = "progress, rating, books or name; default progress")
            @RequestParam(defaultValue = "progress") @Pattern(regexp = "progress|rating|books|name") String sort,
            @Parameter(description = "Zero-based page; default 0") @RequestParam(defaultValue = "0") @Min(0) @Max(Integer.MAX_VALUE / SeriesQueries.PAGE_SIZE) int page) {
        return ResponseEntity.ok(statsService.series(query, search, state, sort, page));
    }

    @Operation(summary = "Get the reading profile", description = "The eight Reading DNA traits and eight Reading Habits, each scored 0–100.")
    @ApiResponse(responseCode = "200", description = "Profile returned successfully")
    @GetMapping("/profile")
    public ResponseEntity<Rows<ProfileRow>> getProfile(@ParameterObject @ModelAttribute StatsQuery query) {
        return ResponseEntity.ok(statsService.profile(query));
    }

    @Operation(summary = "Get reading time by weekday and hour", description = "Recorded reading seconds on matching books by the weekday and hour "
            + "sessions started in, in the requested zone, and how many of each weekday the period holds from the first session up to today.")
    @ApiResponse(responseCode = "200", description = "Slots returned successfully")
    @GetMapping("/slots")
    public ResponseEntity<Slots> getSlots(@ParameterObject @ModelAttribute StatsQuery query,
                                          @Parameter(description = "all, YYYY, YYYY-MM or YYYY-Www; default all") @RequestParam(defaultValue = "all") String period) {
        return ResponseEntity.ok(statsService.slots(query, period));
    }

    @Operation(summary = "Get sessions per day", description = "Sessions on matching books per day of the year they started in, in the requested zone, with all-time reading streaks.")
    @ApiResponse(responseCode = "200", description = "Days returned successfully")
    @GetMapping("/days")
    public ResponseEntity<Days> getDays(@ParameterObject @ModelAttribute StatsQuery query,
                                        @Parameter(description = "YYYY") @RequestParam String year) {
        return ResponseEntity.ok(statsService.days(query, year));
    }

    @Operation(summary = "Get reading time per genre", description = "Recorded reading seconds on matching books for the 36 genres read the longest, over all time.")
    @ApiResponse(responseCode = "200", description = "Genres returned successfully")
    @GetMapping("/genres")
    public ResponseEntity<Rows<GenreTime>> getGenres(@ParameterObject @ModelAttribute StatsQuery query) {
        return ResponseEntity.ok(statsService.genres(query));
    }

    @Operation(summary = "List a week's sessions", description = "The sessions on matching books whose recorded time overlaps the ISO week, in start order, "
            + "at most 200, and whether there were more.")
    @ApiResponse(responseCode = "200", description = "Week returned successfully")
    @GetMapping("/week")
    public ResponseEntity<Week> getWeek(@ParameterObject @ModelAttribute StatsQuery query,
                                        @Parameter(description = "YYYY-Www") @RequestParam String week) {
        return ResponseEntity.ok(statsService.week(query, week));
    }

    @Operation(summary = "Get the days books took to finish", description = "Every matching book finished in the year that has a session with progress "
            + "by its finish, with the days from the local day of its first such session to the local day it was finished, quickest first.")
    @ApiResponse(responseCode = "200", description = "Books returned successfully")
    @GetMapping("/days-to-finish")
    public ResponseEntity<Rows<FinishedBook>> getDaysToFinish(@ParameterObject @ModelAttribute StatsQuery query,
                                                              @Parameter(description = "YYYY") @RequestParam String year) {
        return ResponseEntity.ok(statsService.daysToFinish(query, year));
    }
}
