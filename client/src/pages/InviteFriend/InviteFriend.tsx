/**
 * 邀请链接落地页 —— 同学、室友从微信点链接进来，先看到邀请人，再决定加不加。
 * 只看资料、不自动加人（正门进来，也要两边点头）。
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Avatar from '../../components/Avatar';
import SportIcon from '../../components/SportIcon';
import { Header } from '../../features/motion/components/Header';
import { Icon } from '../../features/motion/components/Icons';
import * as socialApi from '../../api/social';
import { getErrorMessage } from '../../api/client';
import { showToast } from '../../hooks/useAuth';
import { SPORT_LABELS } from '../../types';
import type { PublicUserInfo } from '../../types';
import './InviteFriend.css';

const InviteFriend: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [inviter, setInviter] = useState<PublicUserInfo | null>(null);
  const [error, setError] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'friends'>('idle');

  useEffect(() => {
    if (!code) return;
    let alive = true;
    socialApi.previewInvite(code)
      .then((data) => { if (alive) setInviter(data); })
      .catch((err) => { if (alive) setError(getErrorMessage(err)); });
    return () => { alive = false; };
  }, [code]);

  const send = async () => {
    if (!code) return;
    setState('sending');
    try {
      await socialApi.sendFriendRequest({ inviteCode: code });
      setState('sent');
      showToast('申请已发送，等对方点头', 'success');
    } catch (err) {
      const message = getErrorMessage(err);
      if (message.includes('已经是好友')) {
        setState('friends');
      } else {
        showToast(message, 'error');
        setState('idle');
      }
    }
  };

  return (
    <div className="invite-page">
      <Header title="好友邀请" back={() => navigate('/groups')} />
      {error ? (
        <div className="empty-state">
          <Icon name="users" size={40} />
          <h3>这个邀请链接不能用了</h3>
          <p>{error}</p>
          <button className="btn btn--primary" onClick={() => navigate('/groups')}>去组局看看</button>
        </div>
      ) : !inviter ? (
        <div className="motion-loading" role="status">正在读取邀请…</div>
      ) : (
        <div className="invite-card">
          <Avatar name={inviter.nickname} url={inviter.avatar_url} size={72} />
          <h2>{inviter.nickname}</h2>
          <p className="invite-meta">{inviter.department || '未填写院系'}</p>
          {inviter.sport_preferences?.length ? (
            <div className="invite-tags">
              {inviter.sport_preferences.map((sp) => (
                <span key={sp} className="invite-tag">
                  <SportIcon sport={sp} size={14} />
                  {SPORT_LABELS[sp] || sp}
                </span>
              ))}
            </div>
          ) : null}
          <p className="invite-note">他邀请你加为好友。成为好友之后，你们能互相邀请组局、约下周再练。</p>
          {state === 'sent' ? (
            <p className="invite-done">申请已经发出啦，等他点头。你们成为好友后，他会出现在你的好友列表里。</p>
          ) : state === 'friends' ? (
            <>
              <p className="invite-done">你们已经是好友啦。</p>
              <button className="btn btn--primary btn--lg" onClick={() => navigate('/friends')}>去看看我的好友</button>
            </>
          ) : (
            <div className="invite-actions">
              <button className="btn btn--secondary btn--lg" onClick={() => navigate('/groups')}>先不了</button>
              <button className="btn btn--primary btn--lg" onClick={() => void send()} disabled={state === 'sending'}>
                {state === 'sending' ? '发送中...' : '加为好友'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InviteFriend;
