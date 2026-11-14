import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../features/motion/components/Icons'
import { bossInfo } from '../../features/motion/lib/bossCatalog'
import {
  HP_STATE_NAME,
  isSegmentFight,
  remainingSegments,
  segmentStateKey,
  type BossFightSnapshot,
} from '../../features/motion/lib/bossFightState'
import { getOutfitAvatar } from '../../features/motion/lib/outfits'

/**
 * 组队打怪二期 · 约定段模式的三块界面（设计稿 2026-11-14）：
 * 集结看约定 → 开打记段（远距离：大格子、大按钮）→ 收场结算 → 战报。
 * 规则全在服务端，这里只呈现服务端权威快照并发起动作。
 */

export interface SegmentActions {
  join: () => Promise<unknown>
  setReady: (ready: boolean) => Promise<unknown>
  start: () => Promise<unknown>
  leave: () => Promise<unknown>
  recordSegment: () => Promise<unknown>
  settleSegments: (segmentsDone: number) => Promise<unknown>
  confirmParticipation: () => Promise<unknown>
  saveRecordNote: (note: { km?: number; minutes?: number }) => Promise<unknown>
}

type RunAction = (name: string, fn: () => Promise<unknown>, okMsg?: string) => Promise<void>

function AvatarWithFrame({ avatar, name }: { avatar: any; name: string }) {
  const img = avatar ? getOutfitAvatar(avatar.gender as any, avatar.outfit as any, 'front') : ''
  return (
    <span className={`bf-avatar frame-${avatar?.highest_rarity || 'N'}`} title={avatar ? `${name} · ${avatar.highest_rarity_name}` : name}>
      {img ? <img src={img} alt={`${name}的形象`} draggable={false} /> : <Icon name="user" size={22} />}
    </span>
  )
}

/** 格子排：实心 = 已完成，空心 = 还剩（总数最多 6，一眼数得清） */
export function SegmentPips({ total, done, huge }: { total: number; done: number; huge?: boolean }) {
  return (
    <div className={`bf-pips${huge ? ' huge' : ''}`} role="img" aria-label={`一共 ${total} 格，已经完成 ${done} 格`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`bf-pip${i < done ? ' done' : ''}`} />
      ))}
    </div>
  )
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

const COMBO_LINES = [
  '合击！大家一起发力！',
  '这一波配合，漂亮！',
  '气势上来了，继续！',
  '它有点慌了，再接再厉！',
]

// ---------------------------------------------------------------------------
// 集结（看约定）+ 战斗（记格子）
// ---------------------------------------------------------------------------

export function SegmentFightView(props: {
  snapshot: BossFightSnapshot
  userId: number | string | undefined
  busy: string
  runAction: RunAction
  actions: SegmentActions
}) {
  const { snapshot, runAction, actions } = props
  const boss = bossInfo(snapshot.boss_id)
  const stateKey = segmentStateKey(snapshot)
  const bossImage = boss?.stateImages ? boss.stateImages[stateKey] : boss?.image || ''
  const total = snapshot.segments_total ?? 0
  const done = snapshot.segments_done ?? 0
  const remaining = remainingSegments(snapshot)
  const joined = snapshot.participants.filter((p) => p.status === 'joined')
  const allReady = joined.length >= 2 && joined.every((p) => p.ready)
  const me = snapshot.participants.find((p) => Number(p.user_id) === Number(props.userId)) || null
  const isParticipant = Boolean(me) && me?.status === 'joined'
  const fighting = snapshot.status === 'fighting'

  // 记段防误触：点一次先亮确认，再点才真的记上
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    if (!confirming) return
    const timer = window.setTimeout(() => setConfirming(false), 4000)
    return () => window.clearTimeout(timer)
  }, [confirming])
  // 记成功后确认态收起（以段数变化为准）
  useEffect(() => { setConfirming(false) }, [done])

  // 合击：纯气氛，和进度没有任何关系
  const [combo, setCombo] = useState('')
  const comboIdx = useRef(0)
  useEffect(() => {
    if (!combo) return
    const timer = window.setTimeout(() => setCombo(''), 2600)
    return () => window.clearTimeout(timer)
  }, [combo])

  // 收场面板：步进器从已记段数起步，只能往上补
  const [wrapOpen, setWrapOpen] = useState(false)
  const [wrapCount, setWrapCount] = useState(done)
  useEffect(() => { if (wrapOpen) setWrapCount(done) }, [wrapOpen, done])

  const nameOf = (userId: number) => snapshot.participants.find((p) => p.user_id === userId)?.nickname || '队友'

  return (
    <>
      <section className="bf-seg-stage" aria-label="打怪画面">
        <img src={bossImage} alt={`${snapshot.boss_name}（${HP_STATE_NAME[stateKey]}）`} draggable={false} />
        <span className="bf-boss-tag">{snapshot.boss_name} · {HP_STATE_NAME[stateKey]}</span>
      </section>

      {!fighting ? (
        <section className="bf-seg-contract" aria-label="这次的约定">
          <h2>这次的约定</h2>
          <p className="bf-seg-bigline">{snapshot.segment_label}</p>
          <SegmentPips total={total} done={0} />
          <p className="bf-seg-total">{snapshot.total_label}</p>
          <p className="bf-note">
            开打之后名单就定下来了，中途才加入的算下一场。打的过程中，一段完成了，
            任何人都能点「完成一段」记上，不用等谁。打满 {total} 格就赢；
            没打满就收场的话，它会带着剩下的格跑掉。
          </p>
        </section>
      ) : (
        <section className="bf-seg-fight" aria-label="战斗中">
          <div className="bf-seg-remain">还剩 <b>{remaining}</b> 格</div>
          <SegmentPips total={total} done={done} huge />
          <p className="bf-seg-remind">{snapshot.segment_label}</p>

          {isParticipant && (
            <>
              {!confirming ? (
                <button
                  type="button"
                  className="btn btn--primary btn--block bf-seg-done-btn"
                  disabled={props.busy === 'segment'}
                  onClick={() => setConfirming(true)}
                >
                  完成一段！
                </button>
              ) : (
                <div className="bf-seg-confirm" role="alertdialog" aria-label="确认完成一段">
                  <p>这一段真的完成了吗？</p>
                  <div className="bf-seg-confirm-actions">
                    <button
                      type="button"
                      className="btn btn--primary bf-seg-confirm-yes"
                      disabled={props.busy === 'segment'}
                      onClick={() => void runAction('segment', () => actions.recordSegment(), '记上一段！')}
                    >
                      {props.busy === 'segment' ? '正在记…' : '完成了，记上！'}
                    </button>
                    <button type="button" className="btn btn--secondary" onClick={() => setConfirming(false)}>还没</button>
                  </div>
                </div>
              )}
              <button
                type="button"
                className="btn btn--secondary btn--block bf-big-btn"
                onClick={() => { setCombo(COMBO_LINES[comboIdx.current % COMBO_LINES.length]); comboIdx.current += 1 }}
              >
                合击！
              </button>
              {combo && <p className="bf-seg-combo" role="status">{combo}</p>}
            </>
          )}

          {(snapshot.segments ?? []).length > 0 && (
            <ul className="bf-seg-log" aria-label="已经完成的段">
              {(snapshot.segments ?? []).map((s) => (
                <li key={s.seq}>
                  第 {s.seq} 段 · {timeLabel(s.recorded_at)} · {nameOf(s.recorded_by)}记的
                  {s.source === 'wrapup' && <em>补记</em>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="bf-team" aria-label="队伍">
        {snapshot.participants.map((p) => {
          const mine = Number(p.user_id) === Number(props.userId)
          return (
            <div key={p.user_id} className={`bf-member${mine ? ' mine' : ''}`}>
              <AvatarWithFrame avatar={p.avatar} name={p.nickname} />
              <b>{p.nickname}{mine ? '（我）' : ''}</b>
              {fighting ? (
                <span className="bf-member-status">{p.participated ? '参加了 ✓' : '还没确认'}</span>
              ) : (
                <span className="bf-member-status">{p.status !== 'joined' ? '已退出' : p.ready ? '已准备' : '还没准备'}</span>
              )}
            </div>
          )
        })}
      </section>

      {!fighting && (
        <section className="bf-gather" aria-label="集结">
          {!isParticipant ? (
            <>
              <p className="bf-note">加入队伍就能一起打。约定已经在上面写好了，看清楚再上场。</p>
              <button type="button" className="btn btn--primary btn--block bf-big-btn" disabled={props.busy === 'join'} onClick={() => void runAction('join', () => actions.join(), '已加入队伍')}>
                加入队伍
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`btn btn--block bf-big-btn ${me?.ready ? 'btn--secondary' : 'btn--primary'}`}
                aria-pressed={Boolean(me?.ready)}
                disabled={props.busy === 'ready'}
                onClick={() => void runAction('ready', () => actions.setReady(!me?.ready))}
              >
                {me?.ready ? `你已准备 · 等其他人（${joined.filter((p) => p.ready).length}/${joined.length}）` : '我准备好了'}
              </button>
              {allReady ? (
                <button type="button" className="btn btn--primary btn--block bf-big-btn" disabled={props.busy === 'start'} onClick={() => void runAction('start', () => actions.start(), '开打啦')}>
                  就这么约，开始打怪
                </button>
              ) : (
                <p className="bf-note">{joined.length < 2 ? '至少 2 个人组队才能开打，再喊一个人来。' : `还有 ${joined.filter((p) => !p.ready).length} 个人没点准备好。`}</p>
              )}
              <button type="button" className="bf-text-btn" disabled={props.busy === 'leave'} onClick={() => void runAction('leave', () => actions.leave(), '已退出队伍')}>
                退出队伍
              </button>
            </>
          )}
        </section>
      )}

      {fighting && isParticipant && (
        <section className="bf-seg-me" aria-label="我这边">
          {me?.participated ? (
            <p className="bf-seg-confirmed">你已确认参加 ✓</p>
          ) : (
            <button type="button" className="btn btn--secondary btn--block bf-big-btn" disabled={props.busy === 'confirm'} onClick={() => void runAction('confirm', () => actions.confirmParticipation(), '确认好了')}>
              我参加了
            </button>
          )}
          {!wrapOpen ? (
            <button type="button" className="bf-text-btn" onClick={() => setWrapOpen(true)}>结束今天的挑战</button>
          ) : (
            <div className="bf-seg-wrap" role="group" aria-label="收场结算">
              <p>已经记上 <b>{done}</b> 段。要是有打完但没记上的，在这里补上，只能往上补：</p>
              <div className="bf-seg-stepper">
                <button type="button" aria-label="少一段" disabled={wrapCount <= done} onClick={() => setWrapCount((c) => Math.max(done, c - 1))}>−</button>
                <b>{wrapCount}</b>
                <button type="button" aria-label="多一段" disabled={wrapCount >= total} onClick={() => setWrapCount((c) => Math.min(total, c + 1))}>＋</button>
                <span>/ {total} 段</span>
              </div>
              <p className="bf-note">{wrapCount >= total ? '补满了，就是打赢！' : `就这样结算的话，它会带着剩下的 ${total - wrapCount} 格跑掉。`}</p>
              <button type="button" className="btn btn--primary btn--block bf-big-btn" disabled={props.busy === 'settle'} onClick={() => void runAction('settle', () => actions.settleSegments(wrapCount))}>
                {props.busy === 'settle' ? '正在结算…' : '就这样结算'}
              </button>
              <button type="button" className="bf-text-btn" onClick={() => setWrapOpen(false)}>再想想</button>
            </div>
          )}
        </section>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// 战报
// ---------------------------------------------------------------------------

export function SegmentReport(props: {
  snapshot: BossFightSnapshot
  userId: number | string | undefined
  isHost: boolean
  busy: string
  runAction: RunAction
  actions: SegmentActions
  onRebook: () => void
  onBack: () => void
}) {
  const { snapshot, runAction, actions } = props
  const boss = bossInfo(snapshot.boss_id)
  const won = snapshot.status === 'won'
  const total = snapshot.segments_total ?? 0
  const done = snapshot.segments_done ?? 0
  const remaining = remainingSegments(snapshot)
  const me = snapshot.participants.find((p) => Number(p.user_id) === Number(props.userId)) || null
  const reward = snapshot.my_reward
  const souvenirName = boss?.souvenirName || '首胜纪念章'
  const nameOf = (userId: number) => snapshot.participants.find((p) => p.user_id === userId)?.nickname || '队友'
  const inMakeupWindow = snapshot.ended_at
    ? Date.now() <= Date.parse(snapshot.ended_at) + 24 * 3600 * 1000
    : false
  const canMakeup = Boolean(me) && !me?.participated && inMakeupWindow && snapshot.status !== 'aborted'

  const [km, setKm] = useState('')
  const [minutes, setMinutes] = useState('')
  const hasNote = me?.record_km != null || me?.record_minutes != null

  if (snapshot.status === 'aborted') {
    return (
      <section className="bf-settle">
        <h2>这一场没打成</h2>
        <p>活动结束或者取消，这场打怪就先散了。</p>
        <button type="button" className="btn btn--primary btn--block bf-big-btn" onClick={props.onBack}>回组局</button>
      </section>
    )
  }

  return (
    <section className="bf-settle">
      <span className="bf-seg-mode-tag">约定段模式</span>
      <h2>{won ? '打赢啦！' : `差一点！它带着剩下的 ${remaining} 格血跑啦`}</h2>
      <p>{won ? `${snapshot.boss_name}被你们打趴下了。` : '约定没打满，不怪谁——下次把局约得小一点，或者多喊两个人。'}</p>
      <img className="bf-settle-boss" src={won ? boss?.stateImages?.low || boss?.image : boss?.stateImages?.full || boss?.image} alt={snapshot.boss_name} draggable={false} />

      <div className="bf-seg-report-summary">
        <SegmentPips total={total} done={done} />
        <p>完成了 <b>{done}</b> / {total} 段 · {snapshot.segment_label}</p>
      </div>

      {(snapshot.segments ?? []).length > 0 && (
        <ul className="bf-seg-log report" aria-label="每一段的记录">
          {(snapshot.segments ?? []).map((s) => (
            <li key={s.seq}>
              第 {s.seq} 段 · {timeLabel(s.recorded_at)} · {nameOf(s.recorded_by)}记的
              {s.source === 'wrapup' && <em>收场时补记</em>}
            </li>
          ))}
        </ul>
      )}

      <div className="bf-seg-roster" aria-label="谁参加了">
        {snapshot.participants.map((p) => (
          <div key={p.user_id} className="bf-member">
            <AvatarWithFrame avatar={p.avatar} name={p.nickname} />
            <b>{p.nickname}{Number(p.user_id) === Number(props.userId) ? '（我）' : ''}</b>
            <span className="bf-member-status">{p.participated ? '参加了' : '未确认'}</span>
            {(p.record_km != null || p.record_minutes != null) && (
              <span className="bf-member-status">
                本人记录：{p.record_km != null ? `${p.record_km} 公里` : ''}{p.record_km != null && p.record_minutes != null ? ' · ' : ''}{p.record_minutes != null ? `${p.record_minutes} 分钟` : ''}
              </span>
            )}
          </div>
        ))}
      </div>

      {won && reward?.status === 'granted' && (
        <div className="bf-souvenir">
          <span className="bf-souvenir-tag">新到手</span>
          {boss?.souvenirImage && <img src={boss.souvenirImage} alt={souvenirName} draggable={false} />}
          <b>{souvenirName}</b>
          <small>第一次打赢的纪念，和摄像头那边打赢的是同一枚，只发一次。</small>
        </div>
      )}
      {won && reward?.status === 'pending' && (
        <div className="bf-souvenir pending">
          {boss?.souvenirImage && <img src={boss.souvenirImage} alt={souvenirName} draggable={false} />}
          <b>{souvenirName}</b>
          <small>还差一步：点下面的「补确认参加」，纪念就到手。</small>
        </div>
      )}

      {canMakeup && (
        <button type="button" className="btn btn--primary btn--block bf-big-btn" disabled={props.busy === 'confirm'} onClick={() => void runAction('confirm', () => actions.confirmParticipation(), '补确认好了')}>
          补确认参加{won ? '（纪念会补发）' : ''}
        </button>
      )}

      {me && !hasNote && (
        <div className="bf-seg-note" aria-label="留个记录">
          <p>想留个纪念就填，不填也行——只是给你自己看的，不换算成格子，也不影响结果。</p>
          <div className="bf-seg-note-inputs">
            <label>跑了/游了 <input inputMode="decimal" placeholder="公里" value={km} onChange={(e) => setKm(e.target.value)} /></label>
            <label>活动了 <input inputMode="numeric" placeholder="分钟" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
          </div>
          <button
            type="button"
            className="btn btn--secondary btn--block bf-big-btn"
            disabled={props.busy === 'note' || (!km && !minutes)}
            onClick={() => void runAction('note', () => actions.saveRecordNote({
              ...(km ? { km: Number(km) } : {}),
              ...(minutes ? { minutes: Number(minutes) } : {}),
            }), '记下来了')}
          >
            就记这些
          </button>
        </div>
      )}

      {props.isHost ? (
        <button type="button" className="btn btn--primary btn--block bf-big-btn" onClick={props.onRebook}>
          {won ? '约下次再战' : '再约一次打它'}
        </button>
      ) : (
        <p className="bf-note">想再打一场，等发起人约下一局就好。</p>
      )}
      <button type="button" className="btn btn--secondary btn--block bf-big-btn" onClick={props.onBack}>回组局</button>
    </section>
  )
}

export { isSegmentFight }
