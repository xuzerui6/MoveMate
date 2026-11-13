/**
 * 我的好友 —— 组局社交化一期
 * 上面是「上次一起运动的人」（练过、还没加好友），下面是全部好友。
 * 每个好友两个动作：邀请组局、看主页；更多菜单里有删除好友和拉黑。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Dialog from '../../components/Dialog';
import Avatar from '../../components/Avatar';
import { Header } from '../../features/motion/components/Header';
import { Icon } from '../../features/motion/components/Icons';
import * as socialApi from '../../api/social';
import { getErrorMessage } from '../../api/client';
import { showToast } from '../../hooks/useAuth';
import AddFriendButton from '../../features/social/AddFriend';
import UserProfileDialog from '../../features/social/UserProfileDialog';
import { BlockConfirmDialog } from '../../features/social/SafetyDialogs';
import { commonSportsLabel, friendMetaLine } from '../../features/social/socialLogic';
import type { FriendEntry, RecentPartner } from '../../types';
import './Friends.css';

const Friends: React.FC = () => {
  const navigate = useNavigate();
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [partners, setPartners] = useState<RecentPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [profileFor, setProfileFor] = useState<number | null>(null);
  const [deleteFor, setDeleteFor] = useState<FriendEntry | null>(null);
  const [blockFor, setBlockFor] = useState<FriendEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [friendList, partnerList] = await Promise.all([
        socialApi.fetchFriends(),
        socialApi.fetchRecentPartners(),
      ]);
      setFriends(friendList);
      setPartners(partnerList);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const invite = useCallback((user: { user_id: number }) => {
    navigate(`/create?invite=${user.user_id}`);
  }, [navigate]);

  const confirmDelete = async () => {
    if (!deleteFor) return;
    setDeleting(true);
    try {
      await socialApi.deleteFriend(deleteFor.user_id);
      showToast('已删除好友', 'success');
      setDeleteFor(null);
      await refresh();
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="friends-page">
      <Header title="我的好友" back={() => navigate('/groups')} />

      {loading ? (
        <div className="motion-loading" role="status">正在读取好友…</div>
      ) : error ? (
        <div className="empty-state">
          <Icon name="users" size={40} />
          <h3>暂时无法读取</h3>
          <p>{error}</p>
          <button className="btn btn--primary" onClick={() => void refresh()}>重新加载</button>
        </div>
      ) : (
        <div className="friends-layout">
          <section className="friends-main">
            <div className="friends-heading">
              <h2>全部好友</h2>
              <span>一共 {friends.length} 位</span>
            </div>
            {friends.length === 0 ? (
              <div className="friends-empty">
                <p>还没有好友。打完一局，在结束页把一起练的人加上，下次约起来就方便了。</p>
              </div>
            ) : (
              <ul className="friends-list">
                {friends.map((f) => (
                  <li key={f.user_id} className="friends-row">
                    <Avatar name={f.nickname} url={f.avatar_url} size={48} onClick={() => setProfileFor(f.user_id)} title="看主页" />
                    <div className="friends-row-main">
                      <p className="friends-row-name">{f.nickname}</p>
                      <p className="friends-row-meta">
                        {[f.department, commonSportsLabel(f.sport_preferences)].filter(Boolean).join(' · ') || '还没填院系'}
                      </p>
                      <p className="friends-row-meta">{friendMetaLine(f)}</p>
                    </div>
                    <div className="friends-row-actions">
                      <button className="btn btn--primary btn--sm friends-action" onClick={() => invite(f)}>邀请组局</button>
                      <button className="btn btn--secondary btn--sm friends-action" onClick={() => setProfileFor(f.user_id)}>看主页</button>
                      <div className="friends-more">
                        <button
                          type="button"
                          className="friends-more-btn"
                          aria-label={`${f.nickname} 的更多操作`}
                          aria-expanded={menuFor === f.user_id}
                          onClick={() => setMenuFor(menuFor === f.user_id ? null : f.user_id)}
                        >
                          ···
                        </button>
                        {menuFor === f.user_id && (
                          <div className="friends-more-menu">
                            <button type="button" onClick={() => { setMenuFor(null); setDeleteFor(f); }}>删除好友</button>
                            <button type="button" onClick={() => { setMenuFor(null); setBlockFor(f); }}>拉黑</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="friends-invite-hint">
              <p>想喊现实里的同学、室友？把你的邀请链接发给他，他点开就能加你。</p>
              <button className="btn btn--outline" onClick={() => navigate('/profile')}>去复制我的邀请链接</button>
            </div>
          </section>

          <aside className="friends-side">
            <div className="friends-heading">
              <h2>上次一起运动的人</h2>
            </div>
            <p className="friends-side-note">一起练过，顺手加个好友，下次约起来更方便。</p>
            {partners.length === 0 ? (
              <p className="friends-side-empty">还没有一起练过的人。先去组局里练一场吧。</p>
          ) : (
              <ul className="friends-partner-list">
                {partners.map((p) => (
                  <li key={p.user_id} className="friends-partner-row">
                    <Avatar name={p.nickname} url={p.avatar_url} size={44} />
                    <div className="friends-row-main">
                      <p className="friends-row-name">{p.nickname}</p>
                      <p className="friends-row-meta">
                        {[commonSportsLabel(p.sport_preferences), `一起练过 ${p.together_count} 次`].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <AddFriendButton
                      target={{
                        user_id: p.user_id,
                        nickname: p.nickname,
                        avatar_url: p.avatar_url,
                        department: p.department,
                        sport_preferences: p.sport_preferences,
                        together_count: p.together_count,
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}

      {profileFor !== null && (
        <UserProfileDialog
          userId={profileFor}
          status="friends"
          onInvite={invite}
          onClose={() => setProfileFor(null)}
          onChanged={() => void refresh()}
        />
      )}

      {deleteFor && (
        <Dialog title={`删除好友${deleteFor.nickname}？`} onClose={() => setDeleteFor(null)}>
          <p className="friends-dialog-text">删掉之后，对方不会收到通知；以后在局里遇见，还能再加回来。</p>
          <div className="friends-dialog-actions">
            <button className="btn btn--secondary" onClick={() => setDeleteFor(null)} disabled={deleting}>再想想</button>
            <button className="btn btn--danger" onClick={() => void confirmDelete()} disabled={deleting}>
              {deleting ? '删除中...' : '确认删除'}
            </button>
          </div>
        </Dialog>
      )}

      {blockFor && (
        <BlockConfirmDialog
          user={{ user_id: blockFor.user_id, nickname: blockFor.nickname }}
          onClose={() => setBlockFor(null)}
          onBlocked={() => void refresh()}
        />
      )}
    </div>
  );
};

export default Friends;
