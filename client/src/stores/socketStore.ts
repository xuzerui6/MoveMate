/**
 * WebSocket 连接状态管理
 */
import { create } from 'zustand';
import type { Socket } from 'socket.io-client';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface SocketState {
  socket: Socket | null;
  setSocket: (socket: Socket | null) => void;
  status: ConnectionStatus;
  setStatus: (status: ConnectionStatus) => void;
}

export const useSocketStore = create<SocketState>((set) => ({
  socket: null,
  setSocket: (socket) => set({ socket }),
  status: 'disconnected',
  setStatus: (status) => set({ status }),
}));
