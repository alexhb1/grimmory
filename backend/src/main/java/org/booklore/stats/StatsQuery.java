package org.booklore.stats;

import io.swagger.v3.oas.annotations.Parameter;
import org.booklore.exception.ApiError;
import org.springframework.web.bind.annotation.BindParam;

import java.time.DateTimeException;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;

public record StatsQuery(
        @Parameter(description = "IANA time zone used for every day, hour, week, month and year; defaults to UTC")
        String tz,
        @Parameter(description = "Facet selection in key:value form; repeatable")
        List<String> facet,
        @Parameter(name = "facet_logic", description = "How facet values combine within a group: and, or, or not")
        @BindParam("facet_logic")
        String facetLogic,
        @Parameter(description = "Free-text search limiting the books counted")
        String query) {

    public ZoneId zone() {
        if (tz == null || tz.isBlank()) {
            return ZoneOffset.UTC;
        }
        try {
            return ZoneId.of(tz.trim());
        } catch (DateTimeException e) {
            throw ApiError.INVALID_INPUT.createException("Unknown time zone: " + tz);
        }
    }
}
