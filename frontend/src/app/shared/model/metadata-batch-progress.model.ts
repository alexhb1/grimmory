export enum MetadataBatchStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
  CANCELLED = 'CANCELLED',
}

export const MetadataBatchStatusLabels: Record<MetadataBatchStatus, string> = {
  [MetadataBatchStatus.IN_PROGRESS]: 'In Progress',
  [MetadataBatchStatus.COMPLETED]: 'Completed',
  [MetadataBatchStatus.ERROR]: 'Error',
  [MetadataBatchStatus.CANCELLED]: 'Cancelled',
};

export interface MetadataBatchProgressNotification {
  taskId: string;
  completed: number;
  total: number;
  message: string;
  status: MetadataBatchStatus;
  review: boolean;
}

export function isMetadataBatchProgressNotification(value: unknown): value is MetadataBatchProgressNotification {
  return typeof value === 'object' && value !== null
    && 'taskId' in value && typeof value.taskId === 'string'
    && 'completed' in value && typeof value.completed === 'number'
    && 'total' in value && typeof value.total === 'number'
    && 'message' in value && typeof value.message === 'string'
    && 'status' in value && Object.values(MetadataBatchStatus).some(status => status === value.status)
    && 'review' in value && typeof value.review === 'boolean';
}
