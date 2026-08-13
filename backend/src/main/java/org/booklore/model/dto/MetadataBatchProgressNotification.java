package org.booklore.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import org.booklore.model.enums.MetadataFetchTaskStatus;

@Data
@AllArgsConstructor
public class MetadataBatchProgressNotification {
    private String taskId;
    private int completed;
    private int total;
    private String message;
    private MetadataFetchTaskStatus status;
    private boolean isReview;
}
