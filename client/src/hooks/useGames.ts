/**
 * 大厅局列表 Hook —— 首次加载 + 下拉刷新
 */
import { useEffect, useCallback } from 'react';
import { useGameStore } from '../stores/gameStore';
import type { SportType } from '../types';

export function useGames() {
  const store = useGameStore();

  // 每次进入大厅都重新拉取，先清除日期筛选避免上次点的"今天"把明天的局过滤掉
  useEffect(() => {
    useGameStore.setState((s) => ({ filter: { ...s.filter, date: undefined } }));
    store.fetchGames(true);
  }, []);

  const refresh = useCallback(() => {
    store.fetchGames(true);
  }, []);

  const loadMore = useCallback(() => {
    const current = useGameStore.getState();
    if (!current.loading && current.hasMore) {
      current.fetchGames(false);
    }
  }, []);

  const filterBySport = useCallback((sport?: SportType) => {
    store.filterBySport(sport);
  }, []);

  const filterByCampus = useCallback((campusId?: number, scope?: 'campus' | 'school') => {
    store.filterByCampus(campusId, scope);
  }, []);

  const filterByDate = useCallback((date?: string) => {
    store.filterByDate(date);
  }, []);

  return {
    games: store.games,
    loading: store.loading,
    error: store.error,
    hasMore: store.hasMore,
    filter: store.filter,
    refresh,
    loadMore,
    filterBySport,
    filterByCampus,
    filterByDate,
  };
}
