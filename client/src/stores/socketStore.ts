/**
 * WebSocket 连接状态管理
 */
import { create } from 'zustand';
import type { RealtimeSocket } from '../services/realtime';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface SocketState {
  socket: RealtimeSocket | null;
  setSocket: (socket: RealtimeSocket | null) => void;
  status: ConnectionStatus;
  setStatus: (status: ConnectionStatus) => void;
}

export const useSocketStore = create<SocketState>((set) => ({
  socket: null,
  setSocket: (socket) => set({ socket }),
  status: 'disconnected',
  setStatus: (status) => set({ status }),
}));
