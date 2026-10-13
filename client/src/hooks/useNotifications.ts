/**
 * 通知 Hook —— 拉取列表 + 未读数轮询 + 已读操作
 */
import { useEffect, useCallback, useRef } from 'react';
import { useNotificationStore } from '../stores/notificationStore';
import { useAuthStore } from '../stores/authStore';

export function useNotifications() {
  const store = useNotificationStore();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 首次加载 + 定时轮询未读数（每 30 秒）
  useEffect(() => {
    if (!isLoggedIn) return;

    store.fetchNotifications();
    store.fetchUnreadCount();

    pollRef.current = setInterval(() => {
      store.fetchUnreadCount();
    }, 30000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isLoggedIn]);

  // 页面可见性变化时刷新未读数（用户切换回页面时）
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isLoggedIn) {
        store.fetchUnreadCount();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isLoggedIn]);

  const markRead = useCallback((id: string) => {
    store.markRead(id);
  }, []);

  const markAllRead = useCallback(() => {
    store.markAllRead();
  }, []);

  const clearAll = useCallback(() => {
    store.clearAll();
  }, []);

  return {
    notifications: store.notifications,
    unreadCount: store.unreadCount,
    loading: store.loading,
    error: store.error,
    markRead,
    markAllRead,
    clearAll,
    refresh: store.fetchNotifications,
  };
}
