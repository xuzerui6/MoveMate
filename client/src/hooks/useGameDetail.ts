/**
 * 局详情 Hook —— 获取详情 + 加入/退出 + 发起人操作
 */
import { useState, useEffect, useCallback } from 'react';
import type { Game } from '../types';
import * as gamesApi from '../api/games';
import { getErrorMessage } from '../api/client';
import { showToast } from './useAuth';
import { useAuthStore } from '../stores/authStore';
import { useSocket } from './useSocket';

export function useGameDetail(gameId: string | undefined) {
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const hydrateSession = useAuthStore((s) => s.hydrateSession);

  const { socket } = useSocket();
  const fetchDetail = useCallback(async (silent = false) => {
    if (!gameId) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await gamesApi.fetchGameDetail(gameId) as any;
      // API 返回 {code:0, data: {game: {...}, members: [...]}}
      const body = res.data || res;
      const gameData = body.game || body;
      if (body.members) gameData.participants = body.members;
      setGame(gameData);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    fetchDetail();
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

  /* ---------- 加入局 ---------- */
  const join = useCallback(async () => {
    if (!gameId) return;
    setActionLoading(true);
    try {
      await gamesApi.joinGame(gameId);
      await fetchDetail(); // 重新拉详情获取完整参与者列表
      showToast('加入成功', 'success');
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setActionLoading(false);
    }
  }, [gameId, fetchDetail]);

  /* ---------- 退出局 ---------- */
  const leave = useCallback(async () => {
    if (!gameId) return;
    setActionLoading(true);
    try {
      await gamesApi.leaveGame(gameId);
      await fetchDetail();
      showToast('已退出该局', 'info');
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setActionLoading(false);
    }
  }, [gameId, fetchDetail]);

  /* ---------- 取消局（发起人） ---------- */
  const cancel = useCallback(async () => {
    if (!gameId) return;
    setActionLoading(true);
    try {
      await gamesApi.cancelGame(gameId);
      await fetchDetail();
      showToast('已取消该局', 'info');
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setActionLoading(false);
    }
  }, [gameId]);

  /* ---------- 确认开始 ---------- */
  const confirmStart = useCallback(async () => {
    if (!gameId) return;
    setActionLoading(true);
    try {
      await gamesApi.confirmStart(gameId);
      await fetchDetail();
      showToast('已确认开始', 'success');
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setActionLoading(false);
    }
  }, [gameId]);

  /* ---------- 确认结束 ---------- */
  const confirmEnd = useCallback(async () => {
    if (!gameId) return;
    setActionLoading(true);
    try {
      await gamesApi.confirmEnd(gameId);
      await fetchDetail();
      await hydrateSession();
      showToast('已确认结束', 'success');
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setActionLoading(false);
    }
  }, [gameId, fetchDetail, hydrateSession]);

  const checkIn = useCallback(async () => {
    if (!gameId) return;
    setActionLoading(true);
    try {
      await gamesApi.checkInGame(gameId);
      await fetchDetail();
      showToast('签到成功', 'success');
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setActionLoading(false);
    }
  }, [gameId, fetchDetail]);

  const confirmAttendance = useCallback(async (userId: number | string) => {
    if (!gameId) return;
    setActionLoading(true);
    try {
      await gamesApi.confirmAttendance(gameId, userId);
      await fetchDetail();
      showToast('已确认到场', 'success');
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setActionLoading(false);
    }
  }, [gameId, fetchDetail]);

  return {
    game,
    loading,
    error,
    actionLoading,
    join,
    leave,
    cancel,
    confirmStart,
    confirmEnd,
    checkIn,
    confirmAttendance,
    refetch: fetchDetail,
  };
}
