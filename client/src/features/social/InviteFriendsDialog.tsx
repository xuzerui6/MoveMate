/**
 * 邀请好友 —— 好友勾选列表。邀请不占位置，先到先得。
 * 发送后在本弹窗里反馈结果（谁已邀、谁没发出去及原因）。
 */
import React, { useEffect, useState } from 'react';
import Dialog from '../../components/Dialog';
import Avatar from '../../components/Avatar';
import * as gamesApi from '../../api/games';
import * as socialApi from '../../api/social';
import { getErrorMessage } from '../../api/client';
import { showToast } from '../../hooks/useAuth';
import { commonSportsLabel, inviteCandidates } from './socialLogic';
import type { FriendEntry } from '../../types';
import './social.css';
import './InviteFriendsDialog.css';

interface Props {
  gameId: string;
  members: { user_id: number | string }[];
  onClose: () => void;
}

const InviteFriendsDialog: React.FC<Props> = ({ gameId, members, onClose }) => {
  const [friends, setFriends] = useState<FriendEntry[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    socialApi.fetchFriends()
      .then((list) => { if (alive) setFriends(list); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const candidates = friends ? inviteCandidates(friends, members.map((m) => Number(m.user_id))) : [];

  const toggle = (userId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const send = async () => {
    if (selected.size === 0) return;
    setSending(true);
    try {
      const result = await gamesApi.inviteToGame(gameId, [...selected]);
      if (result.invited.length > 0) {
        showToast(`邀请发出去了（${result.invited.length} 人）`, 'success');
      }
      if (result.skipped.length > 0) {
        showToast(result.skipped.map((s) => s.reason).join('；'), 'info');
      }
      if (result.invited.length === 0 && result.skipped.length === 0) {
        showToast('邀请发出去了', 'success');
      }
      onClose();
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog title="邀请好友" onClose={onClose}>
      <p className="invite-friends-note">邀请不占位置，先到先得——谁先点进来，位置先给谁。</p>
      {failed ? (
        <p className="social-dialog-text">好友列表暂时没读出来，稍后再试。</p>
      ) : friends === null ? (
        <p className="social-dialog-text">正在读取好友…</p>
      ) : candidates.length === 0 ? (
        <p className="social-dialog-text">你的好友都已经在这个局里了，或者你还没有好友——先去好友页加几个人吧。</p>
      ) : (
        <>
          <ul className="invite-friends-list">
            {candidates.map((f) => (
              <li key={f.user_id}>
                <label className="invite-friends-row">
                  <input
                    type="checkbox"
                    checked={selected.has(f.user_id)}
                    onChange={() => toggle(f.user_id)}
                  />
                  <Avatar name={f.nickname} url={f.avatar_url} size={44} />
                  <span className="invite-friends-main">
                    <span className="invite-friends-name">{f.nickname}</span>
                    <span className="invite-friends-meta">
                      {commonSportsLabel(f.sport_preferences) || '还没设置常练项目'}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="social-dialog-actions">
            <button className="btn btn--secondary" onClick={onClose} disabled={sending}>先不邀了</button>
            <button className="btn btn--primary" onClick={() => void send()} disabled={sending || selected.size === 0}>
              {sending ? '发送中...' : `发送邀请${selected.size ? `（${selected.size} 人）` : ''}`}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
};

export default InviteFriendsDialog;
