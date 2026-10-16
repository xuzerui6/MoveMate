import {Icon} from '../../features/motion/components/Icons';
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { fetchLeaderboard } from '../../api/users';
import * as authApi from '../../api/auth';
import type { LeaderboardEntry, PublicUserInfo } from '../../types';
import { SPORT_LABELS } from '../../types';
import { getErrorMessage } from '../../api/client';
import SportIcon from '../../components/SportIcon';
import Avatar from '../../components/Avatar';

function medalColor(rank: number): string {
  if (rank === 1) return '#F59E0B';
  if (rank === 2) return '#74817a';
  if (rank === 3) return '#F97316';
  return '#d3ddd5';
}

function levelTitle(level: number): string {
  if (level >= 6) return '王牌组局者';
  if (level >= 5) return '活跃领队';
  if (level >= 4) return '热血玩家';
  if (level >= 3) return '运动熟人';
  if (level >= 2) return '校园活跃者';
  return '新手球友';
}

const Leaderboard: React.FC = () => {
  const [retry,setRetry]=useState(0);
  const [rankings, setRankings] = useState<LeaderboardEntry[]>([]);
  const [currentUser, setCurrentUser] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 头像弹窗
  const [popupUserId, setPopupUserId] = useState<string | null>(null);
  const [popupInfo, setPopupInfo] = useState<PublicUserInfo | null>(null);
  const [popupLoading, setPopupLoading] = useState(false);

  const openPopup = useCallback(async (userId: string) => {
    if (popupUserId === userId && popupInfo) { setPopupUserId(null); setPopupInfo(null); return; }
    setPopupUserId(userId); setPopupLoading(true);
    try {
      setPopupInfo(await authApi.getPublicUser(userId));
    } catch {
      setPopupInfo(null);
    } finally {
      setPopupLoading(false);
    }
  }, [popupUserId, popupInfo]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.lb-popup') && !(e.target as HTMLElement).closest('.lb-avatar')) {
        setPopupUserId(null); setPopupInfo(null);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchLeaderboard();
        if (!mounted) return;
        setRankings(data.rankings);
        setCurrentUser(data.current_user);
      } catch (err) {
        if (!mounted) return;
        setError(getErrorMessage(err));
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [retry]);

  const podium = useMemo(() => rankings.slice(0, 3), [rankings]);

  const renderPopup = (show: boolean, loading: boolean, info: PublicUserInfo | null) => {
    if (!show) return null;
    return (
      <div  className={["lb-popup","ui-pages-leaderboard-leaderboard-popupCard"].filter(Boolean).join(" ")}>
        {loading ? (
          <span className="ui-pages-leaderboard-leaderboard-popupLoading">加载中...</span>
        ) : info ? (
          <>
            <div className="ui-pages-leaderboard-leaderboard-popupHeader">
              <Avatar name={info.nickname} url={info.avatar_url} size={28} />
              <div>
                <div className="ui-pages-leaderboard-leaderboard-popupName">{info.nickname}</div>
                <div className="ui-pages-leaderboard-leaderboard-popupDept">{info.department || '未填写院系'}</div>
              </div>
            </div>
            <div className="ui-pages-leaderboard-leaderboard-popupSection">
              <div className="ui-pages-leaderboard-leaderboard-popupSectionTitle">运动偏好</div>
              {info.sport_preferences?.length ? (
                <div className="ui-pages-leaderboard-leaderboard-popupTags">
                  {info.sport_preferences.map((s) => (
                    <span key={s} className="ui-pages-leaderboard-leaderboard-popupTag">
                      <SportIcon sport={s} size={14} />{SPORT_LABELS[s] || s}
                    </span>
                  ))}
                </div>
              ) : <span className="ui-pages-leaderboard-leaderboard-popupEmpty">未设置</span>}
            </div>
          </>
        ) : <span className="ui-pages-leaderboard-leaderboard-popupLoading">加载失败</span>}
      </div>
    );
  };

  return (
    <div>
      <div className="ui-pages-leaderboard-leaderboard-hero">
        <div>
          <h1 className="ui-pages-leaderboard-leaderboard-title">排行榜</h1>
          <p className="ui-pages-leaderboard-leaderboard-subtitle">按累计运动 XP 排名，每一次运动都能积累成长。</p>
        </div>
        <div className="ui-pages-leaderboard-leaderboard-heroBadge">XP榜</div>
      </div>

      {currentUser && (
        <div className="ui-pages-leaderboard-leaderboard-currentCard">
          <div>
            <div className="ui-pages-leaderboard-leaderboard-sectionLabel">我的排名</div>
            <div className="ui-pages-leaderboard-leaderboard-currentRankRow">
              <strong className="ui-pages-leaderboard-leaderboard-currentRank">#{currentUser.rank}</strong>
              <span className="ui-pages-leaderboard-leaderboard-currentMeta">
                {currentUser.reward_points} XP · Lv.{currentUser.reward_level}
              </span>
            </div>
          </div>
          <div className="ui-pages-leaderboard-leaderboard-currentSummary">
            连续参与 {currentUser.reward_streak} 天 · 完成 {currentUser.completed_games} 场
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : error ? (
        <div className="empty-state">
          <div className="empty-state__icon"><Icon name="trophy" size={42}/></div>
          <h3 className="empty-state__title">榜单加载失败</h3>
          <p className="empty-state__desc">{error}</p><button className="btn btn--primary" onClick={()=>setRetry(x=>x+1)}>重试</button>
        </div>
      ) : rankings.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon"><Icon name="trophy" size={42}/></div>
          <h3 className="empty-state__title">榜单还没热起来</h3>
          <p className="empty-state__desc">等第一批活动完成后，这里就会出现排名。</p>
        </div>
      ) : (
        <>
          {!!podium.length && (
            <div className="ui-pages-leaderboard-leaderboard-podiumWrap">
              {podium.map((entry) => {
                const showPopup = popupUserId === entry.id;
                return (
                  <div key={entry.id} className="ui-pages-leaderboard-leaderboard-podiumCard">
                    <div
                      className="ui-pages-leaderboard-leaderboard-medal" style={{background: medalColor(entry.rank)}}
                    >
                      {entry.rank}
                    </div>
                    <Avatar
                      name={entry.nickname}
                      url={entry.avatar}
                      size={48}
                      title="查看成员资料"
                      onClick={() => openPopup(entry.id)}
                    />
                    <strong className="ui-pages-leaderboard-leaderboard-podiumName">{entry.nickname}</strong>
                    <span className="ui-pages-leaderboard-leaderboard-podiumPoints">{entry.reward_points} XP</span>
                    <span className="ui-pages-leaderboard-leaderboard-podiumMeta">{levelTitle(entry.reward_level)}</span>
                    {renderPopup(showPopup, popupLoading, popupInfo)}
                  </div>
                );
              })}
            </div>
          )}

          <div className="ui-pages-leaderboard-leaderboard-listCard">
            <div className="ui-pages-leaderboard-leaderboard-listHeader">
              <span className="ui-pages-leaderboard-leaderboard-sectionLabel">完整排名</span>
              <span className="ui-pages-leaderboard-leaderboard-listHint">按XP、完成活动数和成局次数排序</span>
            </div>
            <div className="ui-pages-leaderboard-leaderboard-list">
              {rankings.map((entry) => {
                const showPopup = popupUserId === entry.id;
                return (
                  <div key={entry.id}>
                    <div className="ui-pages-leaderboard-leaderboard-row">
                      <div className="ui-pages-leaderboard-leaderboard-rankCol">
                        <span
                          className="ui-pages-leaderboard-leaderboard-rankChip" style={{color: entry.rank <= 3 ? '#FFF' : '#475569',background: medalColor(entry.rank)}}
                        >
                          {entry.rank}
                        </span>
                      </div>
                      <Avatar
                        name={entry.nickname}
                        url={entry.avatar}
                        size={40}
                        title="查看成员资料"
                        onClick={() => openPopup(entry.id)}
                      />
                      <div className="ui-pages-leaderboard-leaderboard-mainCol">
                        <div className="ui-pages-leaderboard-leaderboard-nameRow">
                          <strong className="ui-pages-leaderboard-leaderboard-name">{entry.nickname}</strong>
                          <span className="ui-pages-leaderboard-leaderboard-points">{entry.reward_points} XP</span>
                        </div>
                        <div className="ui-pages-leaderboard-leaderboard-metaRow">
                          Lv.{entry.reward_level} · 连续 {entry.reward_streak} 天 · 完成 {entry.completed_games} 场
                        </div>
                        {(entry.department || entry.campus_name) && (
                          <div className="ui-pages-leaderboard-leaderboard-subMetaRow">
                            {[entry.department, entry.campus_name].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                    </div>
                    {renderPopup(showPopup, popupLoading, popupInfo)}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};



export default Leaderboard;
