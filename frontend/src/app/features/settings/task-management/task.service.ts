import {inject, Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {BehaviorSubject, map, Observable} from 'rxjs';
import {API_CONFIG} from '../../../core/config/api-config';
import {MetadataRefreshRequest} from '../../metadata/model/request/metadata-refresh-request.model';

export enum TaskType {
  REFRESH_LIBRARY_METADATA = 'REFRESH_LIBRARY_METADATA',
  UPDATE_BOOK_RECOMMENDATIONS = 'UPDATE_BOOK_RECOMMENDATIONS',
  CLEANUP_DELETED_BOOKS = 'CLEANUP_DELETED_BOOKS',
  SYNC_LIBRARY_FILES = 'SYNC_LIBRARY_FILES',
  BOOKDROP_PERIODIC_SCANNING = 'BOOKDROP_PERIODIC_SCANNING',
  CLEANUP_TEMP_METADATA = 'CLEANUP_TEMP_METADATA',
  REFRESH_METADATA_MANUAL = 'REFRESH_METADATA_MANUAL'
}

export const TASK_TYPE_CONFIG: Record<TaskType, { parallel: boolean; async: boolean; displayOrder: number }> = {
  [TaskType.REFRESH_LIBRARY_METADATA]: {parallel: false, async: true, displayOrder: 1},
  [TaskType.SYNC_LIBRARY_FILES]: {parallel: false, async: false, displayOrder: 2},
  [TaskType.BOOKDROP_PERIODIC_SCANNING]: {parallel: false, async: false, displayOrder: 3},
  [TaskType.UPDATE_BOOK_RECOMMENDATIONS]: {parallel: false, async: true, displayOrder: 4},
  [TaskType.CLEANUP_DELETED_BOOKS]: {parallel: false, async: false, displayOrder: 5},
  [TaskType.CLEANUP_TEMP_METADATA]: {parallel: false, async: false, displayOrder: 6},
  [TaskType.REFRESH_METADATA_MANUAL]: {parallel: false, async: false, displayOrder: 7},
};

export enum MetadataReplaceMode {
  REPLACE_ALL = 'REPLACE_ALL',
  REPLACE_MISSING = 'REPLACE_MISSING'
}

export interface LibraryRescanOptions {
  metadataReplaceMode?: MetadataReplaceMode;
}

export interface TaskCreateRequest {
  taskType: TaskType;
  triggeredByCron?: boolean;
  options?: LibraryRescanOptions | MetadataRefreshRequest | null;
}

export interface TaskCreateResponse {
  taskId: string;
  taskType: TaskType;
  status: TaskStatus;
}

export interface TaskStatusResponse {
  taskHistories: TaskHistory[];
}

export enum TaskStatus {
  ACCEPTED = 'ACCEPTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  PENDING = 'PENDING'
}

export interface CronConfig {
  id: number | null;
  taskType: TaskType;
  cronExpression: string | null;
  enabled: boolean;
  options: Record<string, unknown> | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TaskInfo {
  taskType: TaskType;
  name: string;
  description: string;
  parallel: boolean;
  async: boolean;
  cronSupported: boolean;
  cronConfig: CronConfig | null;
  metadata?: string | null;
}

export interface TaskHistory {
  id: string | null;
  type: TaskType;
  status: TaskStatus | null;
  progressPercentage: number | null;
  message: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
}

export interface TaskCancelResponse {
  taskId: string;
  cancelled: boolean;
  message: string;
}

export interface TaskCronConfigRequest {
  cronExpression?: string | null;
  enabled?: boolean | null;
}

export interface TaskProgressPayload {
  taskId: string;
  taskType: TaskType;
  message: string;
  progress: number; // 0-100 percentage
  taskStatus: TaskStatus;
}

interface CronConfigResponse extends Omit<CronConfig, 'taskType'> {
  taskType: unknown;
}

interface TaskCreateResponsePayload extends Omit<TaskCreateResponse, 'taskType'> {
  taskType: unknown;
}

interface TaskInfoResponse extends Omit<TaskInfo, 'taskType' | 'cronConfig'> {
  taskType: unknown;
  cronConfig: CronConfigResponse | null;
}

interface TaskHistoryResponse extends Omit<TaskHistory, 'type'> {
  type: unknown;
}

interface TaskStatusResponsePayload {
  taskHistories: TaskHistoryResponse[];
}

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private http = inject(HttpClient);
  private readonly baseUrl = `${API_CONFIG.BASE_URL}/api/v1/tasks`;

  private taskProgressSubject = new BehaviorSubject<TaskProgressPayload | null>(null);
  public taskProgress$ = this.taskProgressSubject.asObservable();

  getAvailableTasks(): Observable<TaskInfo[]> {
    return this.http.get<TaskInfoResponse[]>(`${this.baseUrl}`).pipe(
      map(tasks => tasks.map(parseTaskInfo))
    );
  }

  startTask(request: TaskCreateRequest): Observable<TaskCreateResponse> {
    return this.http.post<TaskCreateResponsePayload>(`${this.baseUrl}/start`, request).pipe(
      map(parseTaskCreateResponse)
    );
  }

  getLatestTasksForEachType(): Observable<TaskStatusResponse> {
    return this.http.get<TaskStatusResponsePayload>(`${this.baseUrl}/last`).pipe(
      map(response => ({taskHistories: response.taskHistories.map(parseTaskHistory)}))
    );
  }

  cancelTask(taskId: string): Observable<TaskCancelResponse> {
    return this.http.delete<TaskCancelResponse>(`${this.baseUrl}/${taskId}/cancel`);
  }

  updateCronConfig(taskType: TaskType, request: TaskCronConfigRequest): Observable<CronConfig> {
    return this.http.patch<CronConfigResponse>(`${this.baseUrl}/${taskType}/cron`, request).pipe(
      map(parseCronConfig)
    );
  }

  handleTaskProgress(progress: unknown): void {
    if (isTaskProgressPayload(progress)) {
      this.taskProgressSubject.next(progress);
    }
  }
}

function parseTaskInfo(task: TaskInfoResponse): TaskInfo {
  if (!isTaskType(task.taskType)) throw new Error('Invalid task type in available tasks response');
  return {
    ...task,
    taskType: task.taskType,
    cronConfig: task.cronConfig ? parseCronConfig(task.cronConfig) : null,
  };
}

function parseTaskCreateResponse(response: TaskCreateResponsePayload): TaskCreateResponse {
  if (!isTaskType(response.taskType)) throw new Error('Invalid task type in task creation response');
  return {...response, taskType: response.taskType};
}

function parseTaskHistory(history: TaskHistoryResponse): TaskHistory {
  if (!isTaskType(history.type)) throw new Error('Invalid task type in task history response');
  return {...history, type: history.type};
}

function parseCronConfig(config: CronConfigResponse): CronConfig {
  if (!isTaskType(config.taskType)) throw new Error('Invalid task type in cron configuration response');
  return {...config, taskType: config.taskType};
}

function isTaskProgressPayload(value: unknown): value is TaskProgressPayload {
  if (!isRecord(value)) return false;
  return typeof value['taskId'] === 'string'
    && isTaskType(value['taskType'])
    && typeof value['message'] === 'string'
    && typeof value['progress'] === 'number'
    && Number.isFinite(value['progress'])
    && value['progress'] >= 0
    && value['progress'] <= 100
    && isTaskStatus(value['taskStatus']);
}

function isTaskType(value: unknown): value is TaskType {
  return typeof value === 'string' && Object.hasOwn(TASK_TYPE_CONFIG, value);
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && Object.hasOwn(TaskStatus, value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
