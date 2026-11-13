/**
 * 看主页 —— 资料卡升级版：基本信息 +（好友才可见的）运动近况 + 动作区。
 * 动作：加为好友 / 邀请组局 / 更多（举报、拉黑）。不做私聊，这里没有私聊入口。
 */
import React, { useEffect, useState } from 'react';
import Dialog from '../../components/Dialog';
import Avatar from '../../components/Avatar';
import SportIcon from '../../components/SportIcon';
import * as authApi from '../../api/auth';
import { SPORT_LABELS } from '../../types';
import type { FriendshipStatus, PublicUserInfo } from '../../types';
import AddFriendButton from './AddFriend';
import { BlockConfirmDialog, ReportDialog } from './SafetyDialogs';
import { REPORT_REASONS_USER } from './socialLogic';
import './social.css';

interface Props {
  userId: number;
  /** 当前关系（调用方已知时传入，决定加好友按钮形态） */
  status?: FriendshipStatus | string;
  /** 是好友时可传：邀请组局 */
  onInvite?: (user: { user_id: number; nickname: string }) => void;
  onClose: () => void;
  onChanged?: () => void;
}

const UserProfileDialog: React.FC<Props> = ({ userId, status = 'none', onInvite, onClose, onChanged }) => {
  const [info, setInfo] = useState<PublicUserInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    authApi.getPublicUser(String(userId))
      .then((data) => { if (alive) setInfo(data); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [userId]);

  const nickname = info?.nickname || '这位同学';
  const target = {
    user_id: userId,
    nickname,
    avatar_url: info?.avatar_url,
    department: info?.department,
    sport_preferences: info?.sport_preferences,
    together_count: info?.together?.count,
  };

  return (
    <Dialog title="个人主页" onClose={onClose}>
      {failed ? (
        <p className="social-dialog-text">资料暂时没读出来，稍后再看看。</p>
      ) : !info ? (
        <p className="social-dialog-text">正在读取资料…</p>
      ) : (
        <>
          <div className="social-dialog-person">
            <Avatar name={info.nickname} url={info.avatar_url} size={56} />
            <div>
              <p className="social-dialog-name">{info.nickname}</p>
              <p className="social-dialog-meta">{info.department || '未填写院系'}</p>
            </div>
            <div className="social-profile-more">
              <button
                type="button"
                className="social-more-btn"
                aria-label="更多操作"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((v) => !v)}
              >
                ···
              </button>
              {moreOpen && (
                <div className="social-more-menu">
                  <button type="button" onClick={() => { setMoreOpen(false); setReportOpen(true); }}>举报</button>
                  <button type="button" onClick={() => { setMoreOpen(false); setBlockOpen(true); }}>拉黑</button>
                </div>
              )}
            </div>
          </div>

          <div className="social-profile-section">
            <span className="social-profile-label">运动偏好</span>
            <div className="social-profile-tags">
              {info.sport_preferences?.length ? (
                info.sport_preferences.map((sp) => (
                  <span key={sp} className="social-profile-tag">
                    <SportIcon sport={sp} size={14} />
                    {SPORT_LABELS[sp] || sp}
                  </span>
                ))
              ) : (
                <span className="social-dialog-meta">还没设置</span>
              )}
            </div>
          </div>

          {info.together && (
            <p className="social-dialog-text">
              你们一起练过 {info.together.count} 次
              {typeof info.reward_streak === 'number' ? ` · 他已经连续运动 ${info.reward_streak} 天` : ''}
            </p>
          )}

          {info.recent_games && info.recent_games.length > 0 && (
            <div className="social-profile-section">
              <span className="social-profile-label">最近完成的局</span>
              <ul className="social-profile-games">
                {info.recent_games.map((g) => (
                  <li key={g.id}>
                    <span>{g.title || `${SPORT_LABELS[g.sport_type] || g.sport_type}局`}</span>
                    <span className="social-dialog-meta">
                      {new Date(g.start_time).getMonth() + 1}月{new Date(g.start_time).getDate()}日
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="social-dialog-actions">
            <AddFriendButton target={target} status={status} onStatusChange={() => onChanged?.()} />
            {status === 'friends' && onInvite && (
              <button
                className="btn btn--primary"
                onClick={() => { onInvite({ user_id: userId, nickname }); onClose(); }}
              >
                邀请组局
              </button>
            )}
          </div>
        </>
      )}
      {reportOpen && (
        <ReportDialog
          targetType="user"
          targetId={userId}
          targetName={nickname}
          reasons={REPORT_REASONS_USER}
          onClose={() => setReportOpen(false)}
        />
      )}
      {blockOpen && (
        <BlockConfirmDialog
          user={{ user_id: userId, nickname }}
          onClose={() => setBlockOpen(false)}
          onBlocked={() => { onChanged?.(); onClose(); }}
        />
      )}
    </Dialog>
  );
};

export default UserProfileDialog;
