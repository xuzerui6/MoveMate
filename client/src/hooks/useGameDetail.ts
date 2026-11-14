/**
 * 局详情 Hook —— 获取详情 + 加入/退出 + 发起人操作
 *
 * 韧性约定（2026-11-14 线上事故后）：
 * 写操作（签到/加入/开始等）在服务端成功后，先把结果落到本地详情上，
 * 再静默刷新对账。刷新失败或超时绝不丢弃已加载的详情、绝不整页报错——
 * 只显示一行小提示并自动重试一次；整页错误只留给「首次进入就读不到」。
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Game } from '../types';
import * as gamesApi from '../api/games';
import { getErrorMessage } from '../api/client';
import { showToast } from './useAuth';
import { useAuthStore } from '../stores/authStore';
import { useSocket } from './useSocket';
import {
  applyLocalAttendance,
  applyLocalCheckIn,
  applyLocalJoin,
  applyLocalLeave,
  applyLocalStatus,
  resolveDetailFailure,
} from '../pages/GameDetail/gameDetailLocal';

export function useGameDetail(gameId: string | undefined) {
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const hydrateSession = useAuthStore((s) => s.hydrateSession);

  const gameRef = useRef<Game | null>(null);
  const retryTimer = useRef<number | undefined>(undefined);
  const fetchRef = useRef<(silent?: boolean) => Promise<void>>(async () => {});

  const { socket } = useSocket();

  const scheduleRetry = useCallback(() => {
    window.clearTimeout(retryTimer.current);
    retryTimer.current = window.setTimeout(() => { void fetchRef.current(true); }, 2500);
  }, []);

  const fetchDetail = useCallback(async (silent = false) => {
    if (!gameId) return;
    if (!silent) setLoading(true);
    try {
      const res = await gamesApi.fetchGameDetail(gameId) as any;
      // API 返回 {code:0, data: {game: {...}, members: [...]}}，提取规则与
      // GameSummary 共用 api 层的 extractGameDetail（members → participants）。
      const next = gamesApi.extractGameDetail(res);
      gameRef.current = next;
      setGame(next);
      setError(null);
      setRefreshNotice(null);
    } catch (err) {
      const failure = resolveDetailFailure(Boolean(gameRef.current), getErrorMessage(err));
      if (failure.pageError) {
        setError(failure.pageError);
      } else {
        // 已有详情：保留页面，只给小提示，并自动重试一次；
        // 重试仍失败就留着提示等下一次刷新（实时推送/再次操作都会再拉）。
        setRefreshNotice(failure.notice);
        scheduleRetry();
      }
    } finally {
      setLoading(false);
    }
  }, [gameId, scheduleRetry]);

  useEffect(() => { fetchRef.current = fetchDetail; }, [fetchDetail]);
  useEffect(() => () => window.clearTimeout(retryTimer.current), []);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  useEffect(() => {
    if (import.meta.env.VITE_WEBSOCKET_ONLY !== 'true') return;
    const refresh = () => { if (document.visibilityState === 'visible') void fetchDetail(true); };
    const timer = window.setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [fetchDetail]);

  useEffect(() => {
    if (!socket || !gameId) return;
    const update = (data: { gameId: number; changes?: unknown }) => {
      if (String(data.gameId) === String(gameId) && data.changes) void fetchDetail(true);
    };
    const reconnect = () => { void fetchDetail(true); };
    socket.on('game_update', update); socket.on('member_change', update); socket.on('connect', reconnect);
    return () => { socket.off('game_update', update); socket.off('member_change', update); socket.off('connect', reconnect); };
  }, [socket, gameId, fetchDetail]);

  /** 把写操作的结果先落到本地详情上（刷新对账随后进行） */
  const applyLocal = useCallback((updater: (current: Game) => Game) => {
    const current = gameRef.current;
    if (!current) return;
    const next = updater(current);
    gameRef.current = next;
    setGame(next);
  }, []);

  /* ---------- 加入局 ---------- */
  const join = useCallback(async () => {
    if (!gameId) return;
    setActionLoading(true);
    try {
      await gamesApi.joinGame(gameId);
      const user = useAuthStore.getState().user;
      if (user) {
        applyLocal((g) => applyLocalJoin(g, {
          user_id: user.id,
          nickname: user.nickname || '',
          avatar: (user as { avatar_url?: string }).avatar_url || '',
        }));
      }
      await fetchDetail(true); // 静默对账；失败只给小提示，本地结果保留
      showToast('加入成功', 'success');
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setActionLoading(false);
    }
  }, [gameId, fetchDetail, applyLocal]);

  /* ---------- 退出局 ---------- */
  const leave = useCallback(async () => {
    if (!gameId) return;
    setActionLoading(true);
    try {
      await gamesApi.leaveGame(gameId);
      const userId = useAuthStore.getState().user?.id;
      if (userId != null) applyLocal((g) => applyLocalLeave(g, userId));
      await fetchDetail(true);
      showToast('已退出该局', 'info');
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setActionLoading(false);
    }
  }, [gameId, fetchDetail, applyLocal]);

  /* ---------- 取消局（发起人） ---------- */
  const cancel = useCallback(async () => {
    if (!gameId) return;
    setActionLoading(true);
    try {
      await gamesApi.cancelGame(gameId);
      applyLocal((g) => applyLocalStatus(g, 'cancelled'));
      await fetchDetail(true);
      showToast('已取消该局', 'info');
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setActionLoading(false);
    }
  }, [gameId, fetchDetail, applyLocal]);

  /* ---------- 确认开始 ---------- */
  const confirmStart = useCallback(async () => {
    if (!gameId) return;
    setActionLoading(true);
    try {
      await gamesApi.confirmStart(gameId);
      applyLocal((g) => applyLocalStatus(g, 'in_progress'));
      await fetchDetail(true);
      showToast('已确认开始', 'success');
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setActionLoading(false);
    }
  }, [gameId, fetchDetail, applyLocal]);

  /* ---------- 确认结束 ---------- */
  const confirmEnd = useCallback(async () => {
    if (!gameId) return;
    setActionLoading(true);
    try {
      await gamesApi.confirmEnd(gameId);
      applyLocal((g) => applyLocalStatus(g, 'completed'));
      await fetchDetail(true);
      await hydrateSession();
      showToast('已确认结束', 'success');
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setActionLoading(false);
    }
  }, [gameId, fetchDetail, hydrateSession, applyLocal]);

  const checkIn = useCallback(async () => {
    if (!gameId) return;
    setActionLoading(true);
    try {
      const res = await gamesApi.checkInGame(gameId) as any;
      // 用服务端返回的签到时间落本地，不靠猜
      const checkedInAt: string =
        res?.data?.checked_in_at ?? res?.checked_in_at ?? new Date().toISOString();
      const userId = useAuthStore.getState().user?.id;
      if (userId != null) applyLocal((g) => applyLocalCheckIn(g, userId, checkedInAt));
      await fetchDetail(true);
      showToast('签到成功', 'success');
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setActionLoading(false);
    }
  }, [gameId, fetchDetail, applyLocal]);

  const confirmAttendance = useCallback(async (userId: number | string) => {
    if (!gameId) return;
    setActionLoading(true);
    try {
      await gamesApi.confirmAttendance(gameId, userId);
      applyLocal((g) => applyLocalAttendance(g, userId, new Date().toISOString()));
      await fetchDetail(true);
      showToast('已确认到场', 'success');
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setActionLoading(false);
    }
  }, [gameId, fetchDetail, applyLocal]);

  /** 对外刷新：一律走静默对账语义（保留已加载详情，失败只给小提示） */
  const refetch = useCallback(() => fetchDetail(true), [fetchDetail]);

  return {
    game,
    loading,
    error,
    refreshNotice,
    actionLoading,
    join,
    leave,
    cancel,
    confirmStart,
    confirmEnd,
    checkIn,
    confirmAttendance,
    refetch,
  };
}
