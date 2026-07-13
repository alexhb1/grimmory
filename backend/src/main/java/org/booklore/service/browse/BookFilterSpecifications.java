package org.booklore.service.browse;

import lombok.RequiredArgsConstructor;
import org.booklore.app.specification.AppBookSpecification;
import org.booklore.browse.FacetLogic;
import org.booklore.browse.FacetSelection;
import org.booklore.exception.ApiError;
import org.booklore.model.dto.BookLoreUser;
import org.booklore.model.dto.Library;
import org.booklore.model.entity.BookEntity;
import org.booklore.repository.UserContentRestrictionRepository;
import org.booklore.security.policy.ContentRestrictionSpecification;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
public class BookFilterSpecifications {

    private final BookFacetRegistry facetRegistry;
    private final UserContentRestrictionRepository restrictionRepository;

    public Specification<BookEntity> base(String query, FacetSelection facets, FacetLogic facetLogic,
                                          Long userId, boolean isAdmin, Set<Long> libraryIds, String omitAnyPoolFor) {
        List<Specification<BookEntity>> specs = new ArrayList<>();
        specs.add(AppBookSpecification.notDeleted());
        if (!isAdmin) {
            specs.add(inLibraries(libraryIds));
            specs.add(ContentRestrictionSpecification.from(restrictionRepository.findByUserId(userId)));
        }
        if (query != null && !query.isBlank()) {
            specs.add(BookSearchSpecification.matching(query));
        }
        for (String key : facets.keys()) {
            if (!facetRegistry.has(key)) {
                throw ApiError.INVALID_FACET.createException("Unknown facet: " + key);
            }
            List<String> anyValues = facets.any().get(key);
            if (anyValues != null && !key.equals(omitAnyPoolFor)) {
                specs.add(facetRegistry.toSpecification(key, anyValues, facetLogic, userId));
            }
            for (String value : facets.must().getOrDefault(key, List.of())) {
                specs.add(facetRegistry.toSpecification(key, List.of(value), FacetLogic.AND, userId));
            }
            List<String> notValues = facets.not().get(key);
            if (notValues != null) {
                specs.add(facetRegistry.toSpecification(key, notValues, FacetLogic.NOT, userId));
            }
        }
        return AppBookSpecification.combine(specs.toArray(Specification[]::new));
    }

    private static Specification<BookEntity> inLibraries(Set<Long> libraryIds) {
        return (root, query, cb) -> libraryIds.isEmpty()
                ? cb.disjunction()
                : root.get("library").get("id").in(libraryIds);
    }

    public static Set<Long> libraryIds(BookLoreUser user) {
        if (user.getAssignedLibraries() == null) {
            return Set.of();
        }
        return user.getAssignedLibraries().stream().map(Library::getId).collect(Collectors.toSet());
    }
}
