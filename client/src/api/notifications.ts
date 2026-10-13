/**
 * 通知 API: 列表 / 已读 / 未读数
 */
import client from './client';
import type { Notification } from '../types';

type NotificationListResult = {
  notifications: Notification[];
  unreadCount: number;
};

export function normalizeServerTimestamp(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    return new Date().toISOString();
  }

  const value = raw.trim();

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return `${value.replace(' ', 'T')}Z`;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) {
    return `${value}Z`;
  }

  return value;
}

function normalizeNotification(raw: any): Notification {
  return {
    id: String(raw?.id ?? ''),
    type: raw?.type === 'game_ready' ? 'game_starting' : raw?.type,
    title: raw?.title ?? '',
    body: raw?.body ?? raw?.content ?? '',
    game_id: raw?.game_id != null ? String(raw.game_id) : undefined,
    is_read: Boolean(raw?.is_read),
    created_at: normalizeServerTimestamp(raw?.created_at ?? raw?.createdAt),
  };
}

/** 获取通知列表 */
export async function fetchNotifications(page: number = 1): Promise<NotificationListResult> {
  const res: any = await client.get('/notifications', { params: { page } });
  const payload = res?.data ?? res ?? {};

  return {
    notifications: Array.isArray(payload.notifications)
      ? payload.notifications.map(normalizeNotification)
      : [],
    unreadCount: Number(payload.unread_count ?? payload.unreadCount ?? 0),
  };
}

/** 获取未读通知数 */
export async function fetchUnreadCount(): Promise<{ count: number }> {
  const res: any = await client.get('/notifications/unread-count');
  const payload = res?.data ?? res ?? {};

  return {
    count: Number(payload.unread_count ?? payload.unreadCount ?? 0),
  };
}

/** 标记单条通知已读 */
export async function markNotificationRead(id: string): Promise<void> {
  await client.put(`/notifications/${id}/read`);
}

/** 全部标记已读 */
export async function markAllNotificationsRead(): Promise<void> {
  await client.put('/notifications/read-all');
}

/** 清除所有通知 */
export async function clearNotifications(): Promise<void> {
  await client.delete('/notifications/clear');
}
