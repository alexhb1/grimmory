package org.booklore.service.browse;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Tuple;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import lombok.RequiredArgsConstructor;
import org.booklore.browse.FacetLogic;
import org.booklore.browse.FacetSelection;
import org.booklore.browse.ParamsHash;
import org.booklore.config.security.service.AuthenticationService;
import org.booklore.model.dto.BookLoreUser;
import org.booklore.model.dto.browse.FacetGroupsResponse;
import org.booklore.model.dto.browse.FacetGroupsResponse.FacetGroup;
import org.booklore.model.dto.browse.FacetGroupsResponse.FacetLink;
import org.booklore.model.dto.browse.FacetGroupsResponse.Metadata;
import org.booklore.model.dto.browse.FacetGroupsResponse.Properties;
import org.booklore.model.entity.BookEntity;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BookFacetService {

    private static final String PAGE_PATH = "/api/v1/books/page";
    private static final int MAX_VALUES = 100;

    private static final List<FacetDef> FACETS = List.of(
            new FacetDef("author", "Authors", root -> metadata(root).join("authors", JoinType.LEFT).get("name")),
            new FacetDef("genre", "Genre", root -> metadata(root).join("categories", JoinType.LEFT).get("name")),
            new FacetDef("tag", "Tags", root -> metadata(root).join("tags", JoinType.LEFT).get("name")),
            new FacetDef("mood", "Moods", root -> metadata(root).join("moods", JoinType.LEFT).get("name")),
            new FacetDef("series", "Series", root -> metadata(root).get("seriesName")),
            new FacetDef("publisher", "Publisher", root -> metadata(root).get("publisher")),
            new FacetDef("language", "Language", root -> metadata(root).get("language")),
            new FacetDef("narrator", "Narrator", root -> metadata(root).get("narrator")),
            new FacetDef("file_type", "File Type", root -> root.join("bookFiles", JoinType.LEFT).get("bookType")));

    private final AuthenticationService authenticationService;
    private final BookFilterSpecifications filterSpecifications;
    private final BookSortRegistry sortRegistry;

    @PersistenceContext
    private EntityManager entityManager;

    private final Cache<String, FacetGroupsResponse> cache = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofSeconds(30))
            .maximumSize(200)
            .build();

    public FacetGroupsResponse getFacets(FacetSelection facets, String facetLogicParam, String query) {
        BookLoreUser user = authenticationService.getAuthenticatedUser();
        Long userId = user.getId();
        boolean isAdmin = user.getPermissions().isAdmin();
        Set<Long> libraryIds = BookFilterSpecifications.libraryIds(user);

        FacetLogic facetLogic = FacetLogic.from(facetLogicParam);

        String cacheKey = userId + ":" + ParamsHash.compute(query, facets, facetLogic);
        return cache.get(cacheKey, key -> {
            String preserved = BrowseParams.preserved(facets, facetLogicParam, query);
            long fullFilterCount = facets.must().isEmpty()
                    ? 0
                    : countMatchingBooks(filterSpecifications.base(query, facets, facetLogic, userId, isAdmin, libraryIds, null));
            List<FacetGroup> groups = new ArrayList<>();
            groups.add(sortGroup(preserved));
            for (FacetDef def : FACETS) {
                Specification<BookEntity> base = filterSpecifications.base(query, facets, facetLogic, userId, isAdmin, libraryIds, def.key());
                List<FacetCount> counts = count(def, base);
                List<String> mustValues = facets.must().get(def.key());
                if (mustValues != null) {
                    counts = applyMustCounts(counts, mustValues, fullFilterCount);
                }
                groups.add(toGroup(def, counts, preserved));
            }
            return new FacetGroupsResponse(groups);
        });
    }

    // Package-private: lets tests reset the shared singleton cache between runs.
    void clearCache() {
        cache.invalidateAll();
    }

    private long countMatchingBooks(Specification<BookEntity> base) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Long> cq = cb.createQuery(Long.class);
        Root<BookEntity> root = cq.from(BookEntity.class);
        cq.select(cb.countDistinct(root.get("id")));

        Predicate basePredicate = base.toPredicate(root, cq, cb);
        if (basePredicate != null) {
            cq.where(basePredicate);
        }

        return entityManager.createQuery(cq).getSingleResult();
    }

    // A must value is in every result by definition, so its row shows the full-filter total.
    private List<FacetCount> applyMustCounts(List<FacetCount> counts, List<String> mustValues, long fullFilterCount) {
        List<FacetCount> adjusted = counts.stream()
                .map(facetCount -> mustValues.contains(facetCount.value())
                        ? new FacetCount(facetCount.value(), fullFilterCount)
                        : facetCount)
                .collect(Collectors.toCollection(ArrayList::new));

        for (String mustValue : mustValues) {
            if (adjusted.stream().noneMatch(facetCount -> mustValue.equals(facetCount.value()))) {
                adjusted.add(new FacetCount(mustValue, fullFilterCount));
            }
        }
        return adjusted;
    }

    private List<FacetCount> count(FacetDef def, Specification<BookEntity> base) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Tuple> cq = cb.createTupleQuery();
        Root<BookEntity> root = cq.from(BookEntity.class);
        Expression<?> value = def.value().apply(root);
        Expression<Long> count = cb.countDistinct(root.get("id"));

        List<Predicate> predicates = new ArrayList<>();
        Predicate basePredicate = base.toPredicate(root, cq, cb);
        if (basePredicate != null) {
            predicates.add(basePredicate);
        }
        predicates.add(cb.isNotNull(value));

        cq.multiselect(value.alias("value"), count.alias("count"));
        cq.where(predicates.toArray(Predicate[]::new));
        cq.groupBy(value);
        cq.orderBy(cb.desc(count), cb.asc(value));

        return entityManager.createQuery(cq).setMaxResults(MAX_VALUES).getResultList().stream()
                .map(tuple -> new FacetCount(String.valueOf(tuple.get("value")), ((Number) tuple.get("count")).longValue()))
                .toList();
    }

    private FacetGroup toGroup(FacetDef def, List<FacetCount> counts, String preserved) {
        List<FacetLink> links = counts.stream()
                .map(c -> new FacetLink(
                        "facet",
                        pageLink(preserved, "facet=" + BrowseParams.encode(def.key() + ":" + c.value())),
                        "application/json",
                        c.value(),
                        c.value(),
                        new Properties(c.count())))
                .toList();
        return new FacetGroup(new Metadata("facet", def.key(), def.title()), links);
    }

    private FacetGroup sortGroup(String preserved) {
        List<FacetLink> links = new ArrayList<>();
        for (String key : sortRegistry.registry().keys()) {
            if (key.equals("id")) {
                continue;
            }
            links.add(new FacetLink("sort", pageLink(preserved, "sort=" + BrowseParams.encode(key)), "application/json", key + " ascending", key, null));
            links.add(new FacetLink("sort", pageLink(preserved, "sort=-" + BrowseParams.encode(key)), "application/json", key + " descending", "-" + key, null));
        }
        return new FacetGroup(new Metadata("sort", "sort", "Sort"), links);
    }

    private static String pageLink(String preserved, String param) {
        return preserved.isBlank() ? PAGE_PATH + "?" + param : PAGE_PATH + "?" + preserved + "&" + param;
    }

    private static Join<?, ?> metadata(Root<BookEntity> root) {
        return root.join("metadata", JoinType.LEFT);
    }

    private record FacetDef(String key, String title, Function<Root<BookEntity>, Expression<?>> value) {
    }

    private record FacetCount(String value, long count) {
    }
}
