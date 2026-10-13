/**
 * 通知状态管理 —— 列表 / 未读计数 / 已读标记
 */
import { create } from 'zustand';
import type { Notification } from '../types';
import * as notifApi from '../api/notifications';
import { getErrorMessage } from '../api/client';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;

  /** 拉取通知列表 */
  fetchNotifications: () => Promise<void>;

  /** 拉取未读数 */
  fetchUnreadCount: () => Promise<void>;

  /** 标记单条已读 */
  markRead: (id: string) => Promise<void>;

  /** 全部已读 */
  markAllRead: () => Promise<void>;

  /** 清除所有通知 */
  clearAll: () => Promise<void>;

  /** WebSocket 推送新通知时添加 */
  addNotification: (notification: Notification) => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,

  fetchNotifications: async () => {
    const owner=localStorage.getItem('token');
    set({ loading: true, error: null });
    try {
      const result = await notifApi.fetchNotifications();
      if(owner!==localStorage.getItem('token'))return;
      set({
        notifications: result.notifications,
        unreadCount: result.unreadCount,
        loading: false,
      });
    } catch (err) {
      if(owner!==localStorage.getItem('token'))return;
      set({ loading: false, error: getErrorMessage(err) });
    }
  },

  fetchUnreadCount: async () => {
    const owner=localStorage.getItem('token');
    try {
      const result = await notifApi.fetchUnreadCount();
      if(owner!==localStorage.getItem('token'))return;
      set({ unreadCount: result.count });
    } catch (e) {
      if(owner===localStorage.getItem('token'))set({error:getErrorMessage(e)});
    }
  },

  markRead: async (id) => {
    const owner=localStorage.getItem('token');
    try {
      await notifApi.markNotificationRead(id);
      if(owner!==localStorage.getItem('token'))return;
      set((state) => ({
        notifications: state.notifications.map((n) =>
          String(n.id) === String(id) ? { ...n, is_read: true } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - (state.notifications.some((n) => String(n.id) === String(id) && !n.is_read) ? 1 : 0)),
      }));
    } catch (e) {
      if(owner===localStorage.getItem('token'))set({error:getErrorMessage(e)});
    }
  },

  markAllRead: async () => {
    const owner=localStorage.getItem('token');
    try {
      await notifApi.markAllNotificationsRead();
      if(owner!==localStorage.getItem('token'))return;
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
        unreadCount: 0,
      }));
    } catch (e) {
      if(owner===localStorage.getItem('token'))set({error:getErrorMessage(e)});
    }
  },

  addNotification: (notification) => {
    if (get().notifications.some((item) => String(item.id) === String(notification.id))) return;
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));
  },

  clearAll: async () => {
    const owner=localStorage.getItem('token');
    try {
      await notifApi.clearNotifications();
      if(owner!==localStorage.getItem('token'))return;
      set({ notifications: [], unreadCount: 0 });
    } catch (e) {
      if(owner===localStorage.getItem('token'))set({error:getErrorMessage(e)});
    }
  },
}));
