import { useState, useEffect, useCallback, useRef } from 'react';
import type { Message } from '../types';
import * as messagesApi from '../api/messages';
import { getErrorMessage } from '../api/client';
import { normalizeServerTimestamp } from '../api/notifications';
import { useSocket } from './useSocket';
import { useAuthStore } from '../stores/authStore';
import { showToast } from './useAuth';

function normalizeMessage(data: any): Message {
  return {
    id: data.id, game_id: data.gameId ?? data.game_id,
    sender_id: data.sender?.id ?? data.sender_id,
    sender_name: data.sender?.nickname || data.sender_nickname || data.sender_name || '未知用户',
    sender_avatar: data.sender?.avatar || data.sender_avatar_url || data.sender_avatar || '',
    content: data.content, created_at: normalizeServerTimestamp(data.createdAt || data.created_at),
  };
}
function appendMessage(previous: Message[], message: Message): Message[] {
  return previous.some((item) => String(item.id) === String(message.id)) ? previous : [...previous, message];
}

export function useChat(gameId: string | undefined) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { socket } = useSocket();
  const user = useAuthStore((s) => s.user);
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeGame = useRef(gameId);
  activeGame.current = gameId;
  const fetchHistory = useCallback(async () => {
    if (!gameId) { setLoading(false); setError(null); return; }
    try {
      const response: any = await messagesApi.fetchMessages(gameId);
      const body = response.data || response;
      const history = (body.messages || []).map(normalizeMessage).reverse();
      if (activeGame.current !== gameId) return;
      setMessages((previous) => previous.reduce(appendMessage, history));
      setError(null);
    } catch (failure) { setError(getErrorMessage(failure)); }
    finally { setLoading(false); }
  }, [gameId]);
  useEffect(() => {
    setMessages([]); setLoading(true);
    void fetchHistory();
  }, [fetchHistory]);
  useEffect(() => {
    if (!socket || !gameId) return;
    const enter = () => { socket.emit('join_room', { gameId: Number(gameId) }); void fetchHistory(); };
    const receive = (data: any) => {
      if (String(data.gameId) === String(gameId)) setMessages((previous) => appendMessage(previous, normalizeMessage(data)));
    };
    socket.on('connect', enter);
    socket.on('new_message', receive);
    if (socket.connected) enter();
    return () => {
      socket.off('connect', enter); socket.off('new_message', receive);
      socket.emit('leave_room', { gameId: Number(gameId) });
    };
  }, [socket, gameId, fetchHistory]);
  useEffect(() => {
    const list=bottomRef.current?.parentElement;
    if(list && list.scrollHeight>list.clientHeight)list.scrollTo({top:list.scrollHeight,behavior:'smooth'});
  }, [messages]);
  const sendMessage = useCallback((content: string) => {
    if (!gameId || !content.trim()) return;
    if (!socket?.connected) { showToast('连接尚未建立，请稍后重试', 'error'); return; }
    const id = 'temp_' + crypto.randomUUID();
    setMessages((previous) => [...previous, {
      id, game_id: gameId, sender_id: user?.id || '', sender_name: user?.nickname || '我',
      sender_avatar: user?.avatar || '', content: content.trim(), created_at: new Date().toISOString(),
    }]);
    socket.timeout(10000).emit('send_message', { gameId: Number(gameId), content: content.trim() }, (failure: Error | null, reply: any) => {
      if (activeGame.current !== gameId) return;
      setMessages((previous) => {
        const remaining = previous.filter((item) => String(item.id) !== id);
        return reply?.message ? appendMessage(remaining, normalizeMessage(reply.message)) : remaining;
      });
      if (failure || reply?.error) showToast(reply?.error || '发送失败，请重试', 'error');
    });
  }, [socket, gameId, user]);
  return { messages, loading, error, sendMessage, bottomRef, refetch: fetchHistory };
}
