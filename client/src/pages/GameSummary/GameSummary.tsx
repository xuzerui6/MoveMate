/**
 * 结束页 —— 这一期最重要的页面：
 * 一起练的人（顺手加好友）→ 约下周再练（谁确认了一眼看清）→ 我的纪念卡（只带自己的数据）。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Avatar from '../../components/Avatar';
import { Header } from '../../features/motion/components/Header';
import { Icon } from '../../features/motion/components/Icons';
import * as gamesApi from '../../api/games';
import { getErrorMessage } from '../../api/client';
import { showToast } from '../../hooks/useAuth';
import { useAuthStore } from '../../stores/authStore';
import AddFriendButton from '../../features/social/AddFriend';
import ShareCardButton from '../../features/share/ShareCardButton';
import { memorialCardSvg } from '../../features/share/memorialCard';
import { memorialCardFields, rebookConfirmations } from '../../features/social/socialLogic';
import { SPORT_LABELS } from '../../types';
import type { EndSummary, Game } from '../../types';
import './GameSummary.css';

const GameSummary: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [summary, setSummary] = useState<EndSummary | null>(null);
  const [error, setError] = useState('');
  const [rebooked, setRebooked] = useState<Game | null>(null);
  const [rebooking, setRebooking] = useState(false);
  const [joining, setJoining] = useState(false);

  const loadRebooked = useCallback(async (gameId: number) => {
    try {
      const res = await gamesApi.fetchGameDetail(String(gameId));
      setRebooked(gamesApi.extractGameDetail(res));
    } catch {
      setRebooked(null);
    }
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await gamesApi.fetchEndSummary(id);
      setSummary(data);
      setError('');
      if (data.rebooked_game_id) void loadRebooked(data.rebooked_game_id);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [id, loadRebooked]);

  useEffect(() => { void load(); }, [load]);

  if (error) {
    return (
      <div className="summary-page">
        <Header title="这一局结束啦" back={() => navigate(id ? `/game/${id}` : '/groups')} />
        <div className="empty-state">
          <Icon name="users" size={40} />
          <h3>暂时无法读取</h3>
          <p>{error}</p>
          <button className="btn btn--primary" onClick={() => void load()}>重新加载</button>
        </div>
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="summary-page">
        <Header title="这一局结束啦" back={() => navigate(id ? `/game/${id}` : '/groups')} />
        <div className="motion-loading" role="status">正在整理这一局…</div>
      </div>
    );
  }

  const game = summary.game;
  const isHost = Number(game.host_id) === Number(user?.id);
  const fields = memorialCardFields(summary);
  const rebookedMemberIds = rebooked
    ? (rebooked.participants || []).map((p: any) => Number(p.user_id))
    : null;
  const confirmInfo = rebookConfirmations(summary.attendees, rebooked ? rebookedMemberIds : null, Number(user?.id));
  const iAmInRebooked = rebookedMemberIds?.includes(Number(user?.id)) ?? false;

  const doRebook = async () => {
    if (!id) return;
    setRebooking(true);
    try {
      const next = await gamesApi.rebookGame(id);
      showToast('约好啦，下周同一时间、同一场地', 'success');
      setSummary({ ...summary, rebooked_game_id: Number(next.id) });
      await loadRebooked(Number(next.id));
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setRebooking(false);
    }
  };

  const joinRebooked = async () => {
    if (!summary.rebooked_game_id) return;
    setJoining(true);
    try {
      await gamesApi.joinGame(String(summary.rebooked_game_id));
      showToast('确认啦，下周见', 'success');
      await loadRebooked(summary.rebooked_game_id);
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="summary-page">
      <Header title="这一局结束啦" back={() => navigate(`/game/${game.id}`)} />
      <p className="summary-subtitle">
        {SPORT_LABELS[game.sport_type] || game.sport_type} · 和大家一起练完了，辛苦啦。
      </p>

      <section className="summary-card">
        <h2>一起练的人</h2>
        <p className="summary-note">顺手加个好友，下次约起来更方便。</p>
        <ul className="summary-wall">
          {summary.attendees.map((a) => (
            <li key={a.user_id} className="summary-person">
              <Avatar name={a.nickname} url={a.avatar_url} size={56} />
              <span className="summary-person-name">{a.nickname}</span>
              <AddFriendButton
                target={{ user_id: a.user_id, nickname: a.nickname, avatar_url: a.avatar_url }}
                status={a.friendship_status}
                sourceGameId={Number(game.id)}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="summary-card summary-rebook">
        <h2>下周还一起练吗？</h2>
        {summary.rebooked_game_id ? (
          <>
            <p className="summary-note">下周同一时间、同一场地，已经约上了。</p>
            {confirmInfo.line && <p className="summary-confirm-line">{confirmInfo.line}</p>}
            <div className="summary-actions">
              {!iAmInRebooked && rebooked && ['recruiting', 'full'].includes(rebooked.status) && (
                <button className="btn btn--primary btn--lg" onClick={() => void joinRebooked()} disabled={joining}>
                  {joining ? '确认中...' : '我也来（点这里确认）'}
                </button>
              )}
              <button className="btn btn--secondary btn--lg" onClick={() => navigate(`/game/${summary.rebooked_game_id}`)}>
                去看看下周的局
              </button>
            </div>
          </>
        ) : isHost ? (
          <>
            <button className="btn btn--primary btn--lg summary-rebook-btn" onClick={() => void doRebook()} disabled={rebooking}>
              {rebooking ? '正在约...' : '约下周再练'}
            </button>
            <p className="summary-note">下周同一时间、同一场地，约好了大家再确认。</p>
          </>
        ) : (
          <p className="summary-note">等发起人约下周的局，约好了这里会告诉你来确认。</p>
        )}
      </section>

      <section className="summary-card">
        <h2>我的纪念卡</h2>
        <div className="summary-memorial">
          {fields.map((f) => (
            <div key={f.label} className="summary-memorial-row">
              <span>{f.label}</span>
              <strong>{f.value}</strong>
            </div>
          ))}
        </div>
        <p className="summary-note">这张卡上只有你自己的数据，不带别人的。</p>
        <ShareCardButton
          label="保存图片"
          className="btn btn--primary summary-save-btn"
          makeCard={() => ({
            svg: memorialCardSvg(summary, fields),
            fileName: `movemate-game-${game.id}.png`,
            title: '这一局的纪念卡',
          })}
        />
      </section>
    </div>
  );
};

export default GameSummary;
