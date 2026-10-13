package org.booklore.stats;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Tuple;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Path;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import org.booklore.model.entity.BookEntity;
import org.booklore.model.entity.BookMetadataEntity;
import org.booklore.model.entity.ReadingSessionEntity;
import org.booklore.model.enums.BookFileType;
import org.booklore.stats.StatsResponses.Rows;
import org.booklore.stats.StatsResponses.DayCount;
import org.booklore.stats.StatsResponses.Days;
import org.booklore.stats.StatsResponses.GenreTime;
import org.booklore.stats.StatsResponses.FinishedBook;
import org.booklore.stats.StatsResponses.Slot;
import org.booklore.stats.StatsResponses.Slots;
import org.booklore.stats.StatsResponses.Streaks;
import org.booklore.stats.StatsResponses.Week;
import org.booklore.stats.StatsResponses.WeekSession;
import org.hibernate.query.common.TemporalUnit;
import org.hibernate.query.criteria.HibernateCriteriaBuilder;
import org.hibernate.query.criteria.JpaCriteriaQuery;
import org.hibernate.query.criteria.JpaDerivedRoot;
import org.hibernate.query.criteria.JpaEntityJoin;
import org.hibernate.query.criteria.JpaSelectCriteria;
import org.hibernate.query.criteria.JpaSubQuery;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

final class SessionQueries {

    private static final LocalDate DAY_ZERO = LocalDate.of(1900, 1, 1);
    private static final int TOP_GENRES = 36;
    private static final int WEEK_SESSIONS = 200;

    private final EntityManager entityManager;
    private final HibernateCriteriaBuilder cb;
    private final Scope scope;

    SessionQueries(EntityManager entityManager, Scope scope) {
        this.entityManager = entityManager;
        this.cb = (HibernateCriteriaBuilder) entityManager.getCriteriaBuilder();
        this.scope = scope;
    }

    Slots slots(Period period) {
        JpaCriteriaQuery<Tuple> query = cb.createTupleQuery();
        Sessions sessions = sessions(query, query, period);
        Expression<Instant> local = sessions.localStart(period);
        Expression<Integer> weekday = cb.sum(cb.mod(dayNumber(local), 7), 1);
        Expression<Integer> hour = cb.hour(local);
        query.multiselect(weekday, hour, cb.sumAsLong(sessions.session.get("durationSeconds")))
                .where(sessions.where())
                .groupBy(weekday, hour);
        List<Slot> rows = entityManager.createQuery(query).getResultList().stream()
                .map(row -> new Slot(row.get(0, Integer.class), row.get(1, Integer.class), row.get(2, Long.class)))
                .toList();
        return new Slots(rows, weekdays(period));
    }

    private List<Long> weekdays(Period period) {
        JpaCriteriaQuery<Instant> query = cb.createQuery(Instant.class);
        Sessions sessions = sessions(query, query, Period.ALL_TIME);
        Instant first = entityManager.createQuery(query.select(cb.least(sessions.session.<Instant>get("startTime"))).where(sessions.where()))
                .getSingleResult();
        Long[] days = {0L, 0L, 0L, 0L, 0L, 0L, 0L};
        if (first == null) {
            return List.of(days);
        }
        LocalDate from = localDay(first);
        if (period.from() != null && localDay(period.from()).isAfter(from)) {
            from = localDay(period.from());
        }
        LocalDate to = localDay(scope.now()).plusDays(1);
        if (period.to() != null && localDay(period.to()).isBefore(to)) {
            to = localDay(period.to());
        }
        for (LocalDate day = from; day.isBefore(to); day = day.plusDays(1)) {
            days[day.getDayOfWeek().getValue() - 1]++;
        }
        return List.of(days);
    }

    Days days(Period year) {
        JpaCriteriaQuery<Tuple> query = cb.createTupleQuery();
        Sessions sessions = sessions(query, query, Period.ALL_TIME);
        Expression<Integer> day = dayNumber(sessions.localStart(Period.ALL_TIME));
        query.multiselect(day, cb.count(cb.literal(1))).where(sessions.where()).groupBy(day).orderBy(cb.asc(day));
        List<Tuple> days = entityManager.createQuery(query).getResultList();
        long first = ChronoUnit.DAYS.between(DAY_ZERO, localDay(year.from()));
        long end = ChronoUnit.DAYS.between(DAY_ZERO, localDay(year.to()));
        long yesterday = ChronoUnit.DAYS.between(DAY_ZERO, localDay(scope.now())) - 1;
        List<DayCount> rows = new ArrayList<>();
        int current = 0;
        int longest = 0;
        int run = 0;
        long previous = Long.MIN_VALUE;
        for (Tuple row : days) {
            int number = row.get(0, Integer.class);
            run = number == previous + 1 ? run + 1 : 1;
            longest = Math.max(longest, run);
            if (number >= yesterday) {
                current = Math.max(current, run);
            }
            if (number >= first && number < end) {
                rows.add(new DayCount(DAY_ZERO.plusDays(number).toString(), row.get(1, Long.class)));
            }
            previous = number;
        }
        return new Days(rows, new Streaks(current, longest, days.size()));
    }

    Rows<GenreTime> genres() {
        JpaCriteriaQuery<Tuple> query = cb.createTupleQuery();
        JpaSubQuery<Tuple> perBook = query.subquery(Tuple.class);
        Sessions sessions = sessions(perBook, query, Period.ALL_TIME);
        Path<Long> book = sessions.books.id();
        perBook.multiselect(book.alias("book"), cb.sumAsLong(sessions.session.get("durationSeconds")).alias("seconds"))
                .where(sessions.where())
                .groupBy(book);
        JpaDerivedRoot<Tuple> read = query.from(perBook);
        Root<BookMetadataEntity> metadata = query.from(BookMetadataEntity.class);
        Expression<String> genre = metadata.join("categories").get("name");
        Expression<Long> seconds = cb.sum(read.<Long>get("seconds"));
        query.multiselect(genre, seconds)
                .where(cb.equal(metadata.get("bookId"), read.get("book")))
                .groupBy(genre)
                .orderBy(cb.desc(seconds), cb.asc(genre));
        return new Rows<>(entityManager.createQuery(query).setMaxResults(TOP_GENRES).getResultList().stream()
                .map(row -> new GenreTime(row.get(0, String.class), row.get(1, Long.class)))
                .toList());
    }

    Week week(Period week) {
        JpaCriteriaQuery<Tuple> query = cb.createTupleQuery();
        Sessions sessions = sessions(query, query, Period.ALL_TIME);
        Path<Instant> start = sessions.session.get("startTime");
        Path<Instant> end = sessions.session.get("endTime");
        sessions.books.where.addAll(List.of(cb.lessThan(start, week.to()), cb.greaterThan(end, week.from())));
        query.multiselect(sessions.books.id(), sessions.books.title(), sessions.session.get("bookType"), start, end)
                .where(sessions.where())
                .orderBy(cb.asc(start), cb.asc(sessions.session.get("id")));
        List<Tuple> rows = entityManager.createQuery(query).setMaxResults(WEEK_SESSIONS + 1).getResultList();
        return new Week(rows.stream().limit(WEEK_SESSIONS)
                .map(row -> new WeekSession(row.get(0, Long.class), row.get(1, String.class), row.get(2, BookFileType.class),
                        row.get(3, Instant.class), row.get(4, Instant.class)))
                .toList(), rows.size() > WEEK_SESSIONS);
    }

    Rows<FinishedBook> daysToFinish(Period year) {
        JpaCriteriaQuery<Tuple> finished = cb.createTupleQuery();
        JpaSubQuery<Tuple> firstRead = finished.subquery(Tuple.class);
        Root<ReadingSessionEntity> session = firstRead.from(ReadingSessionEntity.class);
        Path<Long> sessionBook = session.get("book").get("id");
        firstRead.multiselect(sessionBook.alias("book"), cb.least(session.<Instant>get("startTime")).alias("firstRead"))
                .where(cb.equal(session.get("user").get("id"), scope.userId()), session.get("endProgress").isNotNull())
                .groupBy(sessionBook);
        BookSql books = BookSql.of(cb, finished, scope);
        JpaDerivedRoot<Tuple> first = finished.from(firstRead);
        Expression<Instant> finishedAt = books.finishedAt();
        Expression<Instant> started = first.get("firstRead");
        books.where.addAll(List.of(cb.equal(books.id(), first.get("book")), cb.greaterThanOrEqualTo(finishedAt, year.from()),
                cb.lessThan(finishedAt, year.to()), cb.lessThanOrEqualTo(started, finishedAt)));
        finished.multiselect(books.title(), started, finishedAt).where(books.where.toArray(Predicate[]::new)).orderBy(cb.asc(books.id()));
        return new Rows<>(entityManager.createQuery(finished).getResultList().stream()
                .map(row -> new FinishedBook(row.get(0, String.class),
                        ChronoUnit.DAYS.between(localDay(row.get(1, Instant.class)), localDay(row.get(2, Instant.class)))))
                .sorted(Comparator.comparingLong(FinishedBook::days))
                .toList());
    }

    private LocalDate localDay(Instant instant) {
        return LocalDate.ofInstant(instant, scope.zone());
    }

    private Sessions sessions(JpaSelectCriteria<?> query, CriteriaQuery<?> top, Period period) {
        BookSql books = BookSql.in(cb, query, top, scope);
        JpaEntityJoin<BookEntity, ReadingSessionEntity> session = books.book.join(ReadingSessionEntity.class);
        session.on(cb.equal(session.get("book").get("id"), books.id()), cb.equal(session.get("user").get("id"), scope.userId()));
        Path<Instant> start = session.get("startTime");
        if (period.from() != null) {
            books.where.add(cb.greaterThanOrEqualTo(start, period.from()));
        }
        if (period.to() != null) {
            books.where.add(cb.lessThan(start, period.to()));
        }
        return new Sessions(books, session);
    }

    private Expression<Integer> dayNumber(Expression<Instant> local) {
        return cb.toInteger(cb.durationByUnit(TemporalUnit.DAY,
                cb.durationBetween(local, cb.literal(DAY_ZERO.atStartOfDay(ZoneOffset.UTC).toInstant()))));
    }

    private record Sessions(BookSql books, JpaEntityJoin<BookEntity, ReadingSessionEntity> session) {

        Predicate[] where() {
            return books.where.toArray(Predicate[]::new);
        }

        Expression<Instant> localStart(Period period) {
            Instant from = period.from() != null ? period.from() : BookSql.EVENTS_FROM;
            return books.local(session.get("startTime"), from);
        }
    }
}
