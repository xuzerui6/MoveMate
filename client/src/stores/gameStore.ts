/**
 * 运动局状态管理 —— 大厅列表 + 筛选 + 缓存更新
 */
import { create } from 'zustand';
import type { Game, GameFilter, SportType } from '../types';
import { useAuthStore } from './authStore';
import * as gamesApi from '../api/games';
import { getErrorMessage } from '../api/client';

interface GameState {
  games: Game[];
  filter: GameFilter;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  page: number;

  /** 拉取局列表 */
  fetchGames: (reset?: boolean) => Promise<void>;

  /** 设置筛选条件并重新拉取 */
  setFilter: (filter: Partial<GameFilter>) => void;

  /** 根据 sportType 筛选 */
  filterBySport: (sport?: SportType) => void;

  /** 根据校区或范围筛选 */
  filterByCampus: (campusId?: number, scope?: 'campus' | 'school') => void;

  /** 根据日期筛选 */
  filterByDate: (date?: string) => void;

  /** 从 WebSocket 更新单个局 */
  updateGame: (gameId: number, changes: Partial<Game>) => void;

  /** 新增局（WebSocket 推送或创建后） */
  addGame: (game: Game) => void;

  /** 移除局（被取消等） */
  removeGame: (gameId: number) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  games: [],
  filter: { size: 20, scope: 'campus' },
  loading: false,
  error: null,
  hasMore: true,
  page: 1,

  fetchGames: async (reset = false) => {
    const owner=useAuthStore.getState().user?.id;
    const { filter, loading, hasMore } = get();
    if (loading) return;
    if (!reset && !hasMore) return;

    const page = reset ? 1 : get().page;
    set({ loading: true, error: null });

    try {
      const res = await gamesApi.fetchGames({ ...filter, page });
      if(owner!==useAuthStore.getState().user?.id)return;
      const body = (res as any).data || res;
      const gameList = body.games || body;
      const newGames = reset ? gameList : [...get().games, ...gameList];
      set({
        games: newGames,
        page: page + 1,
        hasMore: gameList.length >= (filter.size || 20),
        loading: false,
      });
    } catch (err) {
      if(owner!==useAuthStore.getState().user?.id)return;
      set({ loading: false, error: getErrorMessage(err) });
    }
  },

  setFilter: (newFilter) => {
    set((state) => ({
      filter: { ...state.filter, ...newFilter },
      page: 1,
      hasMore: true,
    }));
    // 筛选变更后自动重新拉取
    get().fetchGames(true);
  },

  filterBySport: (sport) => {
    set((state) => ({
      filter: { ...state.filter, sport_type: sport },
      page: 1,
      hasMore: true,
    }));
    get().fetchGames(true);
  },

  filterByCampus: (campusId, scope = 'campus') => {
    const defaultCampusId = useAuthStore.getState().user?.campus_id;
    set((state) => ({
      filter: {
        ...state.filter,
        scope,
        campus_id: scope === 'school' ? undefined : (campusId || defaultCampusId),
      },
      page: 1,
      hasMore: true,
    }));
    get().fetchGames(true);
  },

  filterByDate: (date) => {
    set((state) => ({
      filter: { ...state.filter, date: date || undefined },
      page: 1,
      hasMore: true,
    }));
    get().fetchGames(true);
  },

  updateGame: (gameId, changes) => {
    set((state) => ({
      games: state.games.map((g) =>
        g.id === gameId ? { ...g, ...changes } : g
      ),
    }));
  },

  addGame: (game) => {
    set((state) => ({
      games: [game, ...state.games],
    }));
  },

  removeGame: (gameId) => {
    set((state) => ({
      games: state.games.filter((g) => g.id !== gameId),
    }));
  },
}));
