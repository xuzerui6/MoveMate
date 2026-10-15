import { useEffect, useCallback } from 'react';
import { createRealtimeSocket } from '../services/realtime';
import { useAuthStore } from '../stores/authStore';
import { useSocketStore } from '../stores/socketStore';
import { useGameStore } from '../stores/gameStore';
import { useNotificationStore } from '../stores/notificationStore';
import { normalizeServerTimestamp } from '../api/notifications';

// Only App owns the connection. Page hooks subscribe without disconnecting it.
export function useSocketConnection() {
  const token = useAuthStore((s) => s.token);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  useEffect(() => {
    const store = useSocketStore.getState();
    useNotificationStore.setState({notifications:[],unreadCount:0,loading:false,error:null});
    useGameStore.setState({games:[],loading:false,error:null,page:1,hasMore:true,filter:{size:20,scope:'campus'}});
    if (!isLoggedIn || !token) { store.setStatus('disconnected'); return; }
    const connection = createRealtimeSocket(token);
    store.setSocket(connection);
    store.setStatus('connecting');
    connection.on('connect', () => {
      store.setStatus('connected');
      void useNotificationStore.getState().fetchUnreadCount();
    });
    connection.on('disconnect', () => store.setStatus('disconnected'));
    connection.on('connect_error', (error) => { store.setStatus('error'); console.error('[Socket]', error.message); });
    connection.on('notification', (data: any) => {
      if(data.type === 'motion_changed') {window.dispatchEvent(new Event('motion:refresh'));return;}
      useNotificationStore.getState().addNotification({
        id: String(data.id), type: data.type === 'game_ready' ? 'game_starting' : data.type,
        title: data.title, body: data.body || data.content || '',
        game_id: data.gameId != null ? String(data.gameId) : undefined,
        is_read: false, created_at: normalizeServerTimestamp(data.createdAt || data.created_at),
      });
    });
    const update = (data: { gameId: number; changes?: any }) => {
      if (!data.changes) return;
      useGameStore.getState().updateGame(data.gameId, data.changes);
      if (data.changes.status === 'completed') {void useAuthStore.getState().hydrateSession();window.dispatchEvent(new Event('motion:refresh'));}
    };
    connection.on('game_update', update);
    connection.on('member_change', update);
    connection.connect();
    return () => {
      connection.removeAllListeners();
      connection.disconnect();
      store.setSocket(null);
      store.setStatus('disconnected');
    };
  }, [token, isLoggedIn]);
}

export function useSocket() {
  const socket = useSocketStore((s) => s.socket);
  const status = useSocketStore((s) => s.status);
  const joinRoom = useCallback((gameId: string) => { socket?.emit('join_room', { gameId: Number(gameId) }); }, [socket]);
  const leaveRoom = useCallback((gameId: string) => { socket?.emit('leave_room', { gameId: Number(gameId) }); }, [socket]);
  const getSocket = useCallback(() => socket, [socket]);
  return { socket, status, joinRoom, leaveRoom, getSocket };
}
