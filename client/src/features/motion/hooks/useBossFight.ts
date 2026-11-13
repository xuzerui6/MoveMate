import { useCallback, useEffect, useRef, useState } from 'react'
import * as bossApi from '../../../api/bossFight'
import { getErrorMessage } from '../../../api/client'
import { useSocket } from '../../../hooks/useSocket'
import { useAuthStore } from '../../../stores/authStore'
import { acceptSnapshot, type BossFightSnapshot } from '../lib/bossFightState'

/**
 * 打怪状态：HTTP 拉全量快照 + WebSocket 收广播快照，版本守卫防旧包覆盖。
 * 广播快照不带个人伤害，所以每次广播后节流补拉一次自己的快照，
 * 把 my_damage / my_reward 刷回来；断线重连也直接拉全量（不靠补事件）。
 */
export function useBossFight(gameId: string | undefined) {
  const [snapshot, setSnapshotState] = useState<BossFightSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /** 当前快照到达本机的时刻（配合 server_ts 推算服务端时钟、算延迟样本） */
  const [receivedAt, setReceivedAt] = useState(0)
  /** 最近一次「广播带来了新版本」的时刻——页面用它给延迟采样对表 */
  const [lastBroadcastAt, setLastBroadcastAt] = useState(0)
  const snapshotRef = useRef<BossFightSnapshot | null>(null)
  const refreshTimer = useRef<number | null>(null)
  const { socket } = useSocket()
  const userId = useAuthStore((s) => s.user?.id)

  const apply = useCallback((next: BossFightSnapshot | null): BossFightSnapshot | null => {
    if (!next) {
      snapshotRef.current = null
      setSnapshotState(null)
      return null
    }
    const accepted = acceptSnapshot(snapshotRef.current, next)
    if (accepted !== snapshotRef.current) {
      snapshotRef.current = accepted
      setSnapshotState(accepted)
      setReceivedAt(Date.now())
    }
    return snapshotRef.current
  }, [])

  const refresh = useCallback(async () => {
    if (!gameId) return null
    try {
      const next = await bossApi.fetchFight(gameId)
      setError('')
      return apply(next)
    } catch (err) {
      setError(getErrorMessage(err))
      return snapshotRef.current
    } finally {
      setLoading(false)
    }
  }, [gameId, apply])

  useEffect(() => {
    setLoading(true)
    void refresh()
  }, [refresh])

  // 广播后补拉自己的快照（节流）：广播不带 my_damage / my_reward
  const scheduleOwnRefresh = useCallback(() => {
    if (refreshTimer.current) return
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null
      void refresh()
    }, 900)
  }, [refresh])

  useEffect(() => {
    if (!socket || !gameId) return
    const enter = () => {
      socket.emit('join_room', { gameId: Number(gameId) })
      void refresh()
    }
    const onUpdate = (data: BossFightSnapshot) => {
      if (!data || String(data.game_id) !== String(gameId)) return
      const before = snapshotRef.current
      const after = apply(data)
      if (after && after !== before) {
        setLastBroadcastAt(Date.now())
        scheduleOwnRefresh()
      }
    }
    socket.on('connect', enter)
    socket.on('boss_fight_update', onUpdate)
    if (socket.connected) enter()
    return () => {
      socket.off('connect', enter)
      socket.off('boss_fight_update', onUpdate)
      socket.emit('leave_room', { gameId: Number(gameId) })
    }
  }, [socket, gameId, apply, refresh, scheduleOwnRefresh])

  useEffect(() => () => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
  }, [])

  const act = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      const result = await fn()
      if (result && typeof result === 'object' && 'version' in (result as any)) {
        apply(result as unknown as BossFightSnapshot)
      }
      return result
    },
    [apply],
  )

  const myParticipant = snapshot?.participants.find((p) => Number(p.user_id) === Number(userId)) || null

  return {
    snapshot,
    loading,
    error,
    receivedAt,
    lastBroadcastAt,
    refresh,
    myParticipant,
    myDamage: myParticipant?.my_damage ?? null,
    isParticipant: Boolean(myParticipant) && myParticipant?.status === 'joined',
    create: (input: { movement: string; bossId: string; durationSec: number }) =>
      act(() => bossApi.createFight(gameId!, input)),
    join: (sessionId?: string) => act(() => bossApi.joinFight(gameId!, sessionId)),
    linkSession: (sessionId: string) => act(() => bossApi.linkSession(gameId!, sessionId)),
    setReady: (ready: boolean) => act(() => bossApi.setReady(gameId!, ready)),
    start: () => act(() => bossApi.startFight(gameId!)),
    leave: () => act(() => bossApi.leaveFight(gameId!)),
  }
}
