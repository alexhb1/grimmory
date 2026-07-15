package org.booklore.service.browse;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.booklore.BookloreApplication;
import org.booklore.browse.FacetSelection;
import org.booklore.browse.Link;
import org.booklore.config.security.service.AuthenticationService;
import org.booklore.model.dto.BookLoreUser;
import org.booklore.model.dto.Library;
import org.booklore.model.dto.browse.FacetGroupsResponse;
import org.booklore.model.dto.browse.FacetGroupsResponse.FacetGroup;
import org.booklore.model.dto.browse.FacetGroupsResponse.FacetLink;
import org.booklore.model.entity.AuthorEntity;
import org.booklore.model.entity.BookEntity;
import org.booklore.model.entity.BookLoreUserEntity;
import org.booklore.model.entity.BookMetadataEntity;
import org.booklore.model.entity.CategoryEntity;
import org.booklore.model.entity.LibraryEntity;
import org.booklore.model.entity.LibraryPathEntity;
import org.booklore.model.enums.BookFileType;
import org.booklore.service.task.TaskCronService;
import org.flywaydb.core.Flyway;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@SpringBootTest(classes = BookloreApplication.class)
@Transactional
@TestPropertySource(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.datasource.url=jdbc:h2:mem:facettest;DB_CLOSE_DELAY=-1;NON_KEYWORDS=VALUE",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "app.path-config=build/tmp/test-config",
        "app.bookdrop-folder=build/tmp/test-bookdrop",
        "spring.main.allow-bean-definition-overriding=true",
        "spring.task.scheduling.enabled=false",
        "app.task.scan-library-cron=*/1 * * * * *",
        "app.task.process-bookdrop-cron=*/1 * * * * *",
        "app.features.oidc-enabled=false"
})
@Import(BookFacetServiceTest.TestConfig.class)
class BookFacetServiceTest {

    @Autowired
    private BookFacetService facetService;
    @Autowired
    private ObjectMapper springMapper;
    @MockitoBean
    private AuthenticationService authenticationService;

    @PersistenceContext
    private EntityManager em;

    private BookLoreUserEntity userEntity;
    private LibraryEntity library;
    private LibraryPathEntity libraryPath;
    private final Map<String, CategoryEntity> categories = new HashMap<>();
    private final Map<String, AuthorEntity> authors = new HashMap<>();

    @TestConfiguration
    public static class TestConfig {
        @Bean("flyway")
        @Primary
        public Flyway flyway() {
            return mock(Flyway.class);
        }

        @Bean
        @Primary
        public TaskCronService taskCronService() {
            return mock(TaskCronService.class);
        }
    }

    @BeforeEach
    void seed() {
        facetService.clearCache();
        userEntity = BookLoreUserEntity.builder().username("reader").passwordHash("x").name("Reader").build();
        em.persist(userEntity);
        library = LibraryEntity.builder().name("Lib").icon("book").watch(false)
                .formatPriority(List.of(BookFileType.EPUB)).build();
        em.persist(library);
        libraryPath = LibraryPathEntity.builder().library(library).path("/p").build();
        em.persist(libraryPath);
        when(authenticationService.getAuthenticatedUser()).thenReturn(nonAdminUser());
    }

    private BookLoreUser nonAdminUser() {
        BookLoreUser.UserPermissions permissions = new BookLoreUser.UserPermissions();
        permissions.setAdmin(false);
        return BookLoreUser.builder()
                .id(userEntity.getId())
                .assignedLibraries(List.of(Library.builder().id(library.getId()).build()))
                .permissions(permissions)
                .build();
    }

    private void book(String title, String genre, String authorName) {
        book(title, List.of(genre), authorName);
    }

    private void book(String title, List<String> genres, String authorName) {
        BookEntity bookEntity = BookEntity.builder()
                .library(library).libraryPath(libraryPath).addedOn(Instant.now()).deleted(false).build();
        em.persist(bookEntity);
        BookMetadataEntity metadata = BookMetadataEntity.builder().book(bookEntity).title(title).build();
        metadata.setCategories(genres.stream().map(this::category).collect(Collectors.toSet()));
        metadata.setAuthors(List.of(author(authorName)));
        em.persist(metadata);
        bookEntity.setMetadata(metadata);
    }

    private CategoryEntity category(String name) {
        return categories.computeIfAbsent(name, n -> {
            CategoryEntity e = CategoryEntity.builder().name(n).build();
            em.persist(e);
            return e;
        });
    }

    private AuthorEntity author(String name) {
        return authors.computeIfAbsent(name, n -> {
            AuthorEntity e = AuthorEntity.builder().name(n).build();
            em.persist(e);
            return e;
        });
    }

    private FacetGroup group(FacetGroupsResponse response, String key) {
        return response.facets().stream()
                .filter(g -> g.metadata() != null && key.equals(g.metadata().key()))
                .findFirst().orElseThrow();
    }

    private Long count(FacetGroup group, String value) {
        Optional<FacetLink> link = group.links().stream().filter(l -> value.equals(l.value())).findFirst();
        return link.map(l -> l.properties().numberOfItems()).orElse(null);
    }

    private FacetLink link(FacetGroup group, String value) {
        return group.links().stream()
                .filter(l -> value.equals(l.value()))
                .findFirst().orElseThrow();
    }

    private FacetGroupsResponse facets(List<String> facet, String facetLogic, String query) {
        return facets(facet, null, null, facetLogic, query);
    }

    private FacetGroupsResponse facets(List<String> facet, List<String> facetMust, List<String> facetNot,
                                       String facetLogic, String query) {
        return facetService.getFacets(FacetSelection.parse(facet, facetMust, facetNot), facetLogic, query);
    }

    @Test
    void countsDiscreteFacetsWithCounts() {
        book("A", "Horror", "Alice");
        book("B", "Romance", "Bob");
        em.flush();

        FacetGroupsResponse response = facets(null, null, null);

        assertThat(count(group(response, "genre"), "Horror")).isEqualTo(1);
        assertThat(count(group(response, "genre"), "Romance")).isEqualTo(1);
        assertThat(group(response, "author").links()).extracting(FacetLink::value).contains("Alice", "Bob");
    }

    @Test
    void selectedFacetIsOmittedFromItsOwnCounts() {
        book("A", "Horror", "Alice");
        book("B", "Horror", "Alice");
        book("C", "Romance", "Bob");
        em.flush();

        FacetGroupsResponse response = facets(List.of("genre:Horror"), null, null);

        // genre omits itself: both Horror (2) and Romance (1) still appear with full counts.
        assertThat(count(group(response, "genre"), "Horror")).isEqualTo(2);
        assertThat(count(group(response, "genre"), "Romance")).isEqualTo(1);

        // a different facet honors the genre:Horror filter: only Horror authors remain.
        assertThat(group(response, "author").links()).extracting(FacetLink::value).containsExactly("Alice");
    }

    @Test
    void valuesAreOrderedByCountDescending() {
        book("A", "Horror", "Alice");
        book("B", "Horror", "Alice");
        book("C", "Romance", "Bob");
        em.flush();

        List<String> genres = group(facets(null, null, null), "genre").links()
                .stream().map(FacetLink::value).toList();
        assertThat(genres).containsExactly("Horror", "Romance");
    }

    @Test
    void linksCarryAddHrefAndCount() {
        book("A", "Horror", "Alice");
        em.flush();

        FacetLink horror = link(group(facets(null, null, null), "genre"), "Horror");
        assertThat(horror.href()).isEqualTo("/api/v1/books/page?facet=genre%3AHorror");
        assertThat(horror.properties().numberOfItems()).isEqualTo(1);
        assertThat(horror.rel()).containsExactly("facet");
    }

    @Test
    void responseIsCachedPerParameters() {
        book("A", "Horror", "Alice");
        em.flush();
        FacetGroupsResponse first = facets(null, null, null);
        FacetGroupsResponse second = facets(null, null, null);
        assertThat(first).isSameAs(second);
    }

    @Test
    void includesSortGroup() {
        book("A", "Horror", "Alice");
        em.flush();
        FacetGroup sort = group(facets(null, null, null), "sort");
        assertThat(sort.metadata().rel()).isEqualTo("sort");
        assertThat(sort.links()).extracting(FacetLink::value).contains("title", "-title");
        assertThat(sort.links()).allSatisfy(l -> assertThat(l.rel()).containsExactly("sort"));
    }

    @Test
    void emptyFacetListBehavesLikeNullFacet() {
        book("A", "Horror", "Alice");
        book("B", "Romance", "Bob");
        em.flush();

        FacetGroupsResponse withNull = facets(null, null, null);
        FacetGroupsResponse withEmpty = facets(List.of(), null, null);

        assertThat(count(group(withEmpty, "genre"), "Horror")).isEqualTo(count(group(withNull, "genre"), "Horror"));
        assertThat(count(group(withEmpty, "genre"), "Romance")).isEqualTo(count(group(withNull, "genre"), "Romance"));
        assertThat(count(group(withEmpty, "genre"), "Horror")).isEqualTo(1);
    }

    @Test
    void multipleSelectionsFilterAcrossFacets() {
        book("A", "Horror", "Alice");
        book("B", "Horror", "Bob");
        book("C", "Romance", "Alice");
        em.flush();

        FacetGroupsResponse response = facets(List.of("genre:Horror", "author:Alice"), null, null);

        assertThat(count(group(response, "genre"), "Horror")).isEqualTo(1);
        assertThat(count(group(response, "genre"), "Romance")).isEqualTo(1);

        assertThat(count(group(response, "author"), "Alice")).isEqualTo(1);
        assertThat(count(group(response, "author"), "Bob")).isEqualTo(1);
    }

    @Test
    void facetLogicCombinesSelectedValues() {
        book("A", "Horror", "Alice");
        book("B", "Romance", "Bob");
        book("C", "Fantasy", "Cara");
        em.flush();

        List<String> genres = List.of("genre:Horror", "genre:Romance");

        assertThat(group(facets(genres, "or", null), "author").links())
                .extracting(FacetLink::value).containsExactlyInAnyOrder("Alice", "Bob");

        assertThat(group(facets(genres, "and", null), "author").links()).isEmpty();

        assertThat(group(facets(genres, "not", null), "author").links())
                .extracting(FacetLink::value).containsExactly("Cara");
    }

    @Test
    void mustSelectionIsRetainedWhenCountingItsOwnGroup() {
        book("A", List.of("History", "Science"), "Alice");
        book("B", List.of("History", "Nature"), "Bob");
        book("C", List.of("Romance"), "Cara");
        em.flush();

        FacetGroup genre = group(facets(null, List.of("genre:History"), null, null, null), "genre");

        assertThat(count(genre, "History")).isEqualTo(2);
        assertThat(count(genre, "Science")).isEqualTo(1);
        assertThat(count(genre, "Nature")).isEqualTo(1);
        assertThat(count(genre, "Romance")).isNull();
    }

    @Test
    void mustSelectionCountMatchesFullFilterWhenAnySelectionNarrowsItsGroup() {
        book("A", List.of("Love Stories", "Domestic Fiction"), "Alice");
        book("B", List.of("Love Stories"), "Bob");
        em.flush();

        FacetGroup genre = group(facets(
                List.of("genre:Domestic Fiction"),
                List.of("genre:Love Stories"),
                null,
                null,
                null), "genre");

        assertThat(count(genre, "Love Stories")).isEqualTo(1);
    }

    @Test
    void appendsMustSelectionMissingFromAggregateRows() {
        List<String> genres = new ArrayList<>();
        for (int i = 0; i < 100; i++) {
            genres.add("Genre%03d".formatted(i));
        }
        genres.add("Required");
        book("A", genres, "Alice");
        em.flush();

        FacetGroup genre = group(facets(null, List.of("genre:Required"), null, null, null), "genre");

        assertThat(genre.links()).hasSize(101);
        assertThat(genre.links().getLast().value()).isEqualTo("Required");
        assertThat(genre.links().getLast().properties().numberOfItems()).isEqualTo(1);
    }

    @Test
    void noMustSelectionsDoNotRunExtraFullFilterCountQuery() {
        book("A", "Horror", "Alice");
        em.flush();
        Statistics statistics = em.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics();
        statistics.setStatisticsEnabled(true);

        try {
            facets(List.of("genre:Horror"), null, null);
            statistics.clear();
            FacetGroupsResponse response = facets(null, null, null);
            long noMustQueryCount = statistics.getQueryExecutionCount();

            statistics.clear();
            facets(null, List.of("genre:Horror"), null, null, null);
            long mustQueryCount = statistics.getQueryExecutionCount();

            assertThat(count(group(response, "genre"), "Horror")).isEqualTo(1);
            assertThat(mustQueryCount).isGreaterThan(noMustQueryCount);
        } finally {
            statistics.setStatisticsEnabled(false);
        }
    }

    @Test
    void notSelectionIsRetainedWhenCountingItsOwnGroup() {
        book("A", List.of("History", "Science"), "Alice");
        book("B", List.of("Romance", "Nature"), "Bob");
        book("C", List.of("Science"), "Cara");
        em.flush();

        FacetGroup genre = group(facets(null, null, List.of("genre:Romance"), null, null), "genre");

        assertThat(count(genre, "History")).isEqualTo(1);
        assertThat(count(genre, "Science")).isEqualTo(2);
        assertThat(count(genre, "Nature")).isNull();

        FacetLink romance = link(genre, "Romance");
        assertThat(romance.properties().numberOfItems()).isEqualTo(0);
        assertThat(romance.rel()).containsExactly("self", "facet");
        assertThat(romance.properties().selection()).isEqualTo("not");
    }

    @Test
    void anySelectionZeroedByOtherFiltersKeepsItsRow() {
        book("A", List.of("History"), "Alice");
        book("B", List.of("Romance"), "Bob");
        em.flush();

        FacetGroup genre = group(facets(List.of("genre:History"), null, null, null, "romance"), "genre");

        FacetLink history = link(genre, "History");
        assertThat(history.properties().numberOfItems()).isEqualTo(0);
        assertThat(history.rel()).containsExactly("self", "facet");
        assertThat(history.properties().selection()).isNull();
    }

    @Test
    void mixedSelectionStatesCombineWithinOneKey() {
        book("A", List.of("History", "Science"), "Alice");
        book("B", List.of("History", "Nature"), "Bob");
        book("C", List.of("History", "Science", "Romance"), "Cara");
        book("D", List.of("History", "Fantasy"), "Dan");
        book("E", List.of("Science"), "Eve");
        em.flush();

        FacetGroupsResponse response = facets(
                List.of("genre:Science", "genre:Nature"),
                List.of("genre:History"),
                List.of("genre:Romance"),
                "or",
                null);

        assertThat(group(response, "author").links())
                .extracting(FacetLink::value)
                .containsExactlyInAnyOrder("Alice", "Bob");
        assertThat(count(group(response, "genre"), "Fantasy")).isEqualTo(1);
    }

    @Test
    void mustSelectionReshapesOtherFacetGroups() {
        book("A", List.of("History"), "Alice");
        book("B", List.of("Science"), "Bob");
        book("C", List.of("History", "Nature"), "Cara");
        em.flush();

        FacetGroupsResponse response = facets(null, List.of("genre:History"), null, null, null);

        assertThat(group(response, "author").links())
                .extracting(FacetLink::value)
                .containsExactlyInAnyOrder("Alice", "Cara");
    }

    @Test
    void cacheDistinguishesAnyAndMustBuckets() {
        book("A", List.of("History"), "Alice");
        book("B", List.of("Romance"), "Bob");
        em.flush();

        FacetGroupsResponse anyResponse = facets(List.of("genre:History"), null, null);
        FacetGroupsResponse mustResponse = facets(null, List.of("genre:History"), null, null, null);

        assertThat(count(group(anyResponse, "genre"), "Romance")).isEqualTo(1);
        assertThat(count(group(mustResponse, "genre"), "Romance")).isNull();
    }

    @Test
    void facetValueLinksPreserveMustAndNotSelections() {
        book("A", List.of("History", "Science"), "Alice");
        em.flush();

        FacetLink science = link(group(
                facets(null, List.of("genre:History"), List.of("genre:Romance"), null, null),
                "genre"), "Science");

        assertThat(science.rel()).containsExactly("facet");
        assertThat(science.href()).isEqualTo(
                "/api/v1/books/page?facet_must=genre%3AHistory&facet_not=genre%3ARomance&facet=genre%3AScience");
    }

    @Test
    void mustSelectionIsMarkedSelfWithSelectionProperty() {
        book("A", List.of("History", "Science"), "Alice");
        em.flush();

        FacetGroup genre = group(
                facets(List.of("genre:Science"), List.of("genre:History"), null, null, null), "genre");

        FacetLink science = link(genre, "Science");
        assertThat(science.rel()).containsExactly("self", "facet");
        assertThat(science.properties().selection()).isNull();

        FacetLink history = link(genre, "History");
        assertThat(history.rel()).containsExactly("self", "facet");
        assertThat(history.properties().selection()).isEqualTo("must");
        assertThat(history.href()).isEqualTo(
                "/api/v1/books/page?facet=genre%3AScience&facet_must=genre%3AHistory");
    }

    @Test
    void truncatesValuesAtMax() {
        for (int i = 0; i < 101; i++) {
            book("T" + i, "Genre" + i, "Author" + i);
        }
        em.flush();

        FacetGroupsResponse response = facets(null, null, null);

        assertThat(group(response, "genre").links()).hasSize(100);
        assertThat(group(response, "author").links()).hasSize(100);
    }

    @Test
    void activeFacetIsMarkedSelfWithCurrentPageHref() {
        book("A", "Horror", "Alice");
        book("B", "Romance", "Bob");
        em.flush();

        FacetGroup genre = group(facets(List.of("genre:Horror"), null, null), "genre");
        FacetLink horror = link(genre, "Horror");
        FacetLink romance = link(genre, "Romance");

        assertThat(horror.rel()).containsExactly("self", "facet");
        assertThat(horror.href()).isEqualTo("/api/v1/books/page?facet=genre%3AHorror");

        assertThat(romance.rel()).containsExactly("facet");
        assertThat(romance.href()).isEqualTo("/api/v1/books/page?facet=genre%3AHorror&facet=genre%3ARomance");
    }

    @Test
    void activeFacetSelfHrefKeepsAllSelections() {
        book("A", "Horror", "Alice");
        em.flush();

        FacetGroup genre = group(facets(List.of("genre:Horror", "author:Alice"), null, null), "genre");
        FacetLink horror = link(genre, "Horror");

        assertThat(horror.rel()).containsExactly("self", "facet");
        assertThat(horror.href()).isEqualTo("/api/v1/books/page?facet=genre%3AHorror&facet=author%3AAlice");
    }

    @Test
    void activeFacetMatchIsCaseInsensitive() {
        book("A", "Horror", "Alice");
        em.flush();

        FacetGroup genre = group(facets(List.of("genre:horror"), null, null), "genre");
        FacetLink horror = link(genre, "Horror");

        assertThat(horror.rel()).contains("self");
    }

    @Test
    void responseCarriesTopLevelSelfLink() {
        book("A", "Horror", "Alice");
        em.flush();

        Link bare = facets(null, null, null).links().getFirst();
        assertThat(bare.rel()).containsExactly("self");
        assertThat(bare.href()).isEqualTo("/api/v1/books/facets");
        assertThat(bare.type()).isEqualTo(Link.JSON_TYPE);

        Link filtered = facets(List.of("genre:Horror"), null, "dune").links().getFirst();
        assertThat(filtered.rel()).containsExactly("self");
        assertThat(filtered.href()).isEqualTo("/api/v1/books/facets?facet=genre%3AHorror&query=dune");
    }

    // Serializes through the Spring-managed Jackson 3 mapper, the same one the HTTP
    // layer uses, so a mapper/annotation mismatch can't slip through unit tests again.
    @Test
    void springMapperSerializesSingleRelAsString() {
        book("A", "Horror", "Alice");
        em.flush();

        String json = springMapper.writeValueAsString(facets(List.of("genre:Horror"), null, null));

        assertThat(json).contains("\"rel\":\"self\"");
        assertThat(json).contains("\"rel\":[\"self\",\"facet\"]");
        assertThat(json).doesNotContain("\"rel\":[\"self\"]");
        assertThat(json).doesNotContain("\"rel\":[\"facet\"]");
    }
}
