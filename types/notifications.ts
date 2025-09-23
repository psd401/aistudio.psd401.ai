export interface UserNotification {
  id: number;
  userId: number;
  executionResultId: number;
  type: 'email' | 'in_app';
  status: 'sent' | 'delivered' | 'read' | 'failed';
  deliveryAttempts: number;
  lastAttemptAt: string | null;
  failureReason: string | null;
  createdAt: string;
  executionResult?: ExecutionResult;
}

export interface ExecutionResult {
  id: number;
  scheduledExecutionId: number;
  resultData: Record<string, unknown>;
  status: 'success' | 'failed' | 'running';
  executedAt: string;
  executionDurationMs: number;
  errorMessage: string | null;
  scheduleName: string;
  userId: number;
  assistantArchitectName: string;
}

export interface NotificationBellProps {
  unreadCount: number;
  notifications: UserNotification[];
  onMarkRead: (notificationId: number) => void;
  onMarkAllRead: () => void;
  loading?: boolean;
}

export interface MessageCenterProps {
  messages: ExecutionResult[];
  onViewResult: (resultId: number) => void;
  onRetryExecution?: (scheduledExecutionId: number) => void;
  onDeleteResult?: (resultId: number) => void;
  loading?: boolean;
}

export interface NotificationContextValue {
  notifications: UserNotification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  markAsRead: (notificationId: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
}