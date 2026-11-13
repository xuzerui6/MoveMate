/**
 * 加好友控件 —— 按钮状态由关系派生；点「加为好友」先弹确认小卡（可留一句招呼）。
 * 设计稿第 2 组：发送申请 / 先不加了；对方同意之后才是好友。
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Dialog from '../../components/Dialog';
import Avatar from '../../components/Avatar';
import * as socialApi from '../../api/social';
import { getErrorMessage } from '../../api/client';
import { showToast } from '../../hooks/useAuth';
import { commonSportsLabel, friendActionKind } from './socialLogic';
import type { FriendshipStatus } from '../../types';
import './social.css';

export interface FriendTarget {
  user_id: number;
  nickname: string;
  avatar_url?: string;
  department?: string;
  sport_preferences?: string[];
  together_count?: number;
}

interface DialogProps {
  target: FriendTarget;
  sourceGameId?: number;
  onClose: () => void;
  onSent: () => void;
}

export const FriendRequestDialog: React.FC<DialogProps> = ({ target, sourceGameId, onClose, onSent }) => {
  const [greeting, setGreeting] = useState('');
  const [sending, setSending] = useState(false);
  const sports = commonSportsLabel(target.sport_preferences);
  const meta = [target.department, sports, target.together_count ? `一起练过 ${target.together_count} 次` : '']
    .filter(Boolean)
    .join(' · ');

  const send = async () => {
    setSending(true);
    try {
      await socialApi.sendFriendRequest({
        userId: target.user_id,
        greeting: greeting.trim() || undefined,
        sourceGameId,
      });
      showToast('申请已发送，等对方点头', 'success');
      onSent();
      onClose();
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog title={`加${target.nickname}为好友`} onClose={onClose}>
      <div className="social-dialog-person">
        <Avatar name={target.nickname} url={target.avatar_url} size={48} />
        <div>
          <p className="social-dialog-name">{target.nickname}</p>
          {meta && <p className="social-dialog-meta">{meta}</p>}
        </div>
      </div>
      <label className="social-dialog-label" htmlFor="friend-greeting">留一句招呼（可不填）</label>
      <textarea
        id="friend-greeting"
        className="social-dialog-textarea"
        value={greeting}
        onChange={(e) => setGreeting(e.target.value)}
        placeholder="你好，上次一起练得很开心，下次还一起呀"
        maxLength={100}
        rows={3}
      />
      <div className="social-dialog-actions">
        <button className="btn btn--secondary" onClick={onClose} disabled={sending}>先不加了</button>
        <button className="btn btn--primary" onClick={() => void send()} disabled={sending}>
          {sending ? '发送中...' : '发送申请'}
        </button>
      </div>
      <p className="social-dialog-note">对方同意之后，你们就是好友了。</p>
    </Dialog>
  );
};

interface ButtonProps {
  target: FriendTarget;
  /** 初始关系（来自列表/结束页数据）；发送成功后内部切到「已发送申请」 */
  status?: FriendshipStatus | string;
  sourceGameId?: number;
  onStatusChange?: (next: FriendshipStatus) => void;
}

const AddFriendButton: React.FC<ButtonProps> = ({ target, status = 'none', sourceGameId, onStatusChange }) => {
  const navigate = useNavigate();
  const [localStatus, setLocalStatus] = useState<FriendshipStatus | string>(status);
  const [dialogOpen, setDialogOpen] = useState(false);
  const kind = friendActionKind(localStatus);

  if (kind === 'self' || kind === 'blocked') return null;
  if (kind === 'friends') return <span className="social-friend-state">已是好友</span>;
  if (kind === 'pending') return <span className="social-friend-state">已发送申请</span>;
  if (kind === 'respond') {
    return (
      <button className="btn btn--outline btn--sm social-friend-btn" onClick={() => navigate('/notifications')}>
        对方想加你，去处理
      </button>
    );
  }
  return (
    <>
      <button className="btn btn--outline btn--sm social-friend-btn" onClick={() => setDialogOpen(true)}>
        加为好友
      </button>
      {dialogOpen && (
        <FriendRequestDialog
          target={target}
          sourceGameId={sourceGameId}
          onClose={() => setDialogOpen(false)}
          onSent={() => {
            setLocalStatus('pending');
            onStatusChange?.('pending');
          }}
        />
      )}
    </>
  );
};

export default AddFriendButton;
