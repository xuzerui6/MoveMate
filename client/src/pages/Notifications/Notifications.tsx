import Dialog from '../../components/Dialog';
import Avatar from '../../components/Avatar';
import {Icon} from '../../features/motion/components/Icons';
/**
 * 通知列表页（支持多选批量删除）
 * 好友申请在这里处理：点开看申请人、同意/拒绝；拒绝不通知对方。
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../../hooks/useNotifications';
import type { FriendRequestItem, Notification, NotificationType } from '../../types';
import client, { getErrorMessage } from '../../api/client';
import * as socialApi from '../../api/social';
import { commonSportsLabel } from '../../features/social/socialLogic';
import { showToast } from '../../hooks/useAuth';
import './Notifications.css';

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

const Notifications: React.FC = () => {
  const navigate = useNavigate();
  const { notifications, unreadCount, loading, error, markRead, markAllRead, refresh } = useNotifications();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [friendRequests, setFriendRequests] = useState<FriendRequestItem[]>([]);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [handlingId, setHandlingId] = useState<number | null>(null);

  const refreshRequests = useCallback(async () => {
    try {
      setFriendRequests(await socialApi.fetchIncomingRequests());
    } catch {
      setFriendRequests([]);
    }
  }, []);
  useEffect(() => { void refreshRequests(); }, [refreshRequests]);

  const handleRequest = async (req: FriendRequestItem, accept: boolean) => {
    setHandlingId(req.id);
    try {
      if (accept) await socialApi.acceptFriendRequest(req.id);
      else await socialApi.rejectFriendRequest(req.id);
      if (accept) showToast(`你和${req.nickname}已经是好友了`, 'success');
      setFriendRequests((prev) => {
        const next = prev.filter((r) => r.id !== req.id);
        if (next.length === 0) setRequestsOpen(false);
        return next;
      });
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setHandlingId(null);
    }
  };

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === notifications.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(notifications.map(n => n.id)));
    }
  }, [notifications, selected]);

  const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()); };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      await client.delete('/notifications/batch', { data: { ids: Array.from(selected).map(Number) } });
      setSelected(new Set());
      setSelectMode(false);
      await refresh();
    } catch (err) { showToast(getErrorMessage(err), 'error'); }
    finally { setDeleting(false); }
  };

  const handleClick = (notif: Notification) => {
    if (selectMode) { toggleSelect(notif.id); return; }
    if (!notif.is_read) markRead(notif.id);
    // 好友申请：不跳局，打开处理面板（申请人可能就是从某个局里加的）
    if (notif.type === 'friend_request') { setRequestsOpen(true); return; }
    if (notif.type === 'friend_accepted') { navigate('/friends'); return; }
    if (notif.game_id) navigate(`/game/${notif.game_id}`);
  };

  const handleClear = () => setShowClearConfirm(true);
  const confirmClear = async () => {
    setShowClearConfirm(false);
    try { await client.delete('/notifications/clear'); await refresh(); } catch (err) { showToast(getErrorMessage(err), 'error'); }
  };

  return (
    <div className="notifications-page">
      <div className="ui-pages-notifications-notifications-header">
        <h1 className="ui-pages-notifications-notifications-title">通知</h1>
        <div className="ui-pages-notifications-notifications-inline-0">
          {notifications.length > 0 && !selectMode && (
            <>
              {unreadCount > 0 && (
                <button className="ui-pages-notifications-notifications-readAllBtn" onClick={markAllRead}>全部已读</button>
              )}
              <button className="ui-pages-notifications-notifications-selectBtn" onClick={() => setSelectMode(true)}>选择</button>
            </>
          )}
          {selectMode && (
            <>
              <button className="ui-pages-notifications-notifications-selectAllBtn" onClick={toggleAll}>
                {selected.size === notifications.length ? '取消全选' : '全选'}
              </button>
              <button
                className="ui-pages-notifications-notifications-clearBtn" style={{opacity: selected.size === 0 ? 0.4 : 1}}
                disabled={selected.size === 0 || deleting}
                onClick={deleteSelected}
              >
                {deleting ? '删除中...' : `删除(${selected.size})`}
              </button>
              <button className="ui-pages-notifications-notifications-cancelSelectBtn" onClick={exitSelectMode}>取消</button>
            </>
          )}
        </div>
      </div>

      {friendRequests.length > 0 && (
        <button className="friend-request-banner" onClick={() => setRequestsOpen(true)}>
          <span className="friend-request-banner-title">新的好友申请</span>
          <span className="friend-request-banner-desc">
            {friendRequests[0].nickname} 想加你为好友{friendRequests.length > 1 ? `，一共 ${friendRequests.length} 条` : ''} · 点开处理
          </span>
        </button>
      )}

      {error&&<div className="inline-error" role="alert"><p>{error}</p><button className="btn btn--secondary" onClick={()=>void refresh()}>重试</button></div>}
      {loading && notifications.length === 0 ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : error && notifications.length === 0 ? null : notifications.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon"><Icon name="bell" size={42}/></div>
          <h3 className="empty-state__title">干净得很</h3>
          <p className="empty-state__desc">目前没有收到新通知</p>
        </div>
      ) : (
        <div className="ui-pages-notifications-notifications-list">
          {notifications.map((notif, idx) => {
            const isLast = idx === notifications.length - 1;
            
            return (
              <div
                key={notif.id}
                role="button" tabIndex={0} aria-label={`${notif.is_read?'已读':'未读'}：${notif.title}`}
                onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();handleClick(notif);}}}
                className="ui-pages-notifications-notifications-item" style={{borderBottom: isLast ? 'none' : '1px solid #edf2ee',cursor: selectMode ? 'pointer' : 'pointer'}}
                onClick={() => handleClick(notif)}
              >
                {/* 选择框 / 未读指示器 */}
                <div className="ui-pages-notifications-notifications-indicatorCol">
                  {selectMode ? (
                    <div className="ui-pages-notifications-notifications-checkbox" style={{background: selected.has(notif.id) ? 'var(--color-primary)' : '#FFF',borderColor: selected.has(notif.id) ? 'var(--color-primary)' : 'var(--line)'}}>
                      {selected.has(notif.id) && <Icon name="check" size={16}/>}
                    </div>
                  ) : (
                    !notif.is_read && <span className="ui-pages-notifications-notifications-dot" />
                  )}
                </div>

                {/* 内容 */}
                <div className="ui-pages-notifications-notifications-content">
                  <div className="ui-pages-notifications-notifications-titleRow">
                    <p className="ui-pages-notifications-notifications-notifTitle" style={{color: notif.is_read ? 'var(--muted)' : 'var(--ink)',fontWeight: notif.is_read ? 500 : 700}}>
                      {notif.title}
                    </p>
                    <span className="ui-pages-notifications-notifications-time">{formatTime(notif.created_at)}</span>
                  </div>
                  
                  {notif.body && (
                    <p className="ui-pages-notifications-notifications-notifBody" style={{color: 'var(--muted)'}}>
                      {notif.body}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 清理确认弹窗 */}
      {showClearConfirm && (
        <Dialog title="确认清理全部通知？" onClose={()=>setShowClearConfirm(false)}>
            <p className="ui-pages-notifications-notifications-dialogDesc">清理后无法恢复</p>
            <div className="ui-pages-notifications-notifications-dialogActions">
              <button className="ui-pages-notifications-notifications-cancelBtn" onClick={() => setShowClearConfirm(false)}>取消</button>
              <button className="ui-pages-notifications-notifications-dangerBtn" onClick={confirmClear}>确认清理</button>
            </div>
        </Dialog>
      )}

      {/* 好友申请处理 */}
      {requestsOpen && (
        <Dialog title="新的好友申请" onClose={() => setRequestsOpen(false)}>
          <div className="friend-request-list">
            {friendRequests.map((req) => (
              <div key={req.id} className="friend-request-item">
                <div className="friend-request-person">
                  <Avatar name={req.nickname} url={req.avatar_url} size={48} />
                  <div>
                    <p className="friend-request-name">{req.nickname}</p>
                    <p className="friend-request-meta">
                      {[req.department, commonSportsLabel(req.sport_preferences)].filter(Boolean).join(' · ') || '还没填院系'}
                    </p>
                  </div>
                </div>
                {req.greeting && (
                  <p className="friend-request-greeting">他留的话：「{req.greeting}」</p>
                )}
                <div className="friend-request-actions">
                  <button
                    className="btn btn--secondary"
                    disabled={handlingId === req.id}
                    onClick={() => void handleRequest(req, false)}
                  >
                    拒绝
                  </button>
                  <button
                    className="btn btn--primary"
                    disabled={handlingId === req.id}
                    onClick={() => void handleRequest(req, true)}
                  >
                    {handlingId === req.id ? '处理中...' : '同意'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="friend-request-note">同意了，你们就能互相邀请组局。拒绝不会通知对方，不用有负担。</p>
        </Dialog>
      )}
    </div>
  );
};



export default Notifications;
