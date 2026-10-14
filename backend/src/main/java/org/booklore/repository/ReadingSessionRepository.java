package org.booklore.repository;

import org.booklore.model.entity.ReadingSessionEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface ReadingSessionRepository extends JpaRepository<ReadingSessionEntity, Long> {

    @Query(value = """
            SELECT rs
            FROM ReadingSessionEntity rs
            JOIN FETCH rs.book b
            LEFT JOIN FETCH b.metadata
            WHERE rs.user.id = :userId
            AND b.id = :bookId
            ORDER BY rs.startTime DESC
            """,
            countQuery = """
            SELECT COUNT(rs)
            FROM ReadingSessionEntity rs
            WHERE rs.user.id = :userId
            AND rs.book.id = :bookId
            """)
    Page<ReadingSessionEntity> findByUserIdAndBookId(
            @Param("userId") Long userId,
            @Param("bookId") Long bookId,
            Pageable pageable);
}
