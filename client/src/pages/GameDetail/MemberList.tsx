/**
 * 参与者列表 —— 头像（可点击查看公开资料） + 昵称 + 角色标签
 * 资料卡里可以加好友、举报、拉黑；发起人还能请人离局。
 */
import React, { useState, useCallback, useEffect } from 'react';
import type { FriendshipStatus, PublicUserInfo } from '../../types';
import { SPORT_LABELS } from '../../types';
import * as authApi from '../../api/auth';
import SportIcon from '../../components/SportIcon';
import Avatar from '../../components/Avatar';
import { useAuthStore } from '../../stores/authStore';
import AddFriendButton from '../../features/social/AddFriend';
import { BlockConfirmDialog, RemoveMemberDialog, ReportDialog } from '../../features/social/SafetyDialogs';
import { REPORT_REASONS_USER } from '../../features/social/socialLogic';

interface Props {
  participants: any[];
  creatorId: number;
  isCreator?: boolean;
  gameState?: string;
  actionLoading?: boolean;
  onConfirmAttendance?: (userId: number | string) => void;
  /** 局 id（请人离局用） */
  gameId?: string;
  /** 局开始时间 ISO（请人离局的 30 分钟锁用） */
  gameStartTime?: string;
  /** 我与每位成员的关系（加好友按钮形态） */
  friendStatus?: Map<number, FriendshipStatus>;
  /** 加好友/拉黑等关系变化后，通知父组件刷新关系表 */
  onSocialChanged?: () => void;
  /** 有人离局后刷新成员列表 */
  onRemoved?: () => void;
}

const MemberList: React.FC<Props> = ({
  participants,
  creatorId,
  isCreator = false,
  gameState,
  actionLoading = false,
  onConfirmAttendance,
  gameId,
  gameStartTime,
  friendStatus,
  onSocialChanged,
  onRemoved,
}) => {
  const currentUser = useAuthStore((s) => s.user);
  const [popupUserId, setPopupUserId] = useState<string | null>(null);
  const [popupInfo, setPopupInfo] = useState<PublicUserInfo | null>(null);
  const [popupLoading, setPopupLoading] = useState(false);
  const [reportFor, setReportFor] = useState<{ user_id: number; nickname: string } | null>(null);
  const [blockFor, setBlockFor] = useState<{ user_id: number; nickname: string } | null>(null);
  const [removeFor, setRemoveFor] = useState<{ user_id: number; nickname: string } | null>(null);

  const openPopup = useCallback(async (userId: string) => {
    if (popupUserId === userId && popupInfo) {
      setPopupUserId(null);
      setPopupInfo(null);
      return;
    }
    setPopupUserId(userId);
    setPopupLoading(true);
    try {
      const info = await authApi.getPublicUser(userId);
      setPopupInfo(info);
    } catch {
      setPopupInfo(null);
    } finally {
      setPopupLoading(false);
    }
  }, [popupUserId, popupInfo]);

  // 点击外部关闭 popup
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.member-popup-card') && !target.closest('.member-avatar-btn')) {
        setPopupUserId(null);
        setPopupInfo(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!participants || participants.length === 0) {
    return (
      <div className="ui-pages-gamedetail-memberlist-container">
        <h3 className="ui-pages-gamedetail-memberlist-title">活动成员</h3>
        <p className="ui-pages-gamedetail-memberlist-empty">暂无参与者</p>
      </div>
    );
  }

  return (
    <div className="ui-pages-gamedetail-memberlist-container">
      <h3 className="ui-pages-gamedetail-memberlist-title">活动成员 <span>{participants.length} 人</span></h3>
      <div className="ui-pages-gamedetail-memberlist-list">
        {participants.map((p: any) => {
          const name = p.nickname || '未知';
          const userId = String(p.user_id);
          const isHostMember = Number(p.user_id) === Number(creatorId);
          const hasCheckedIn = Boolean(p.checked_in_at);
          const attendanceConfirmed = Boolean(p.attendance_confirmed_at);
          const showConfirmBtn = Boolean(
            isCreator &&
            !isHostMember &&
            onConfirmAttendance &&
            hasCheckedIn &&
            !attendanceConfirmed &&
            (gameState === 'ready' || gameState === 'in_progress')
          );
          const showPopup = popupUserId === userId;

          return (
            <div key={p.user_id} className="ui-pages-gamedetail-memberlist-memberWrap">
              <div className="ui-pages-gamedetail-memberlist-member">
                <Avatar
                  name={name}
                  url={p.avatar_url}
                  size={40}
                  title="查看成员资料"
                  onClick={() => openPopup(userId)}
                />
                <div className="ui-pages-gamedetail-memberlist-infoCol">
                  <div className="ui-pages-gamedetail-memberlist-nameRow">
                    <span className="ui-pages-gamedetail-memberlist-name">{name}</span>
                    <span className="ui-pages-gamedetail-memberlist-levelChip">
                      Lv.{p.reward_level || 1} · {p.total_reward_points || 0} XP
                    </span>
                  </div>
                  {!isHostMember && (
                    <span className="ui-pages-gamedetail-memberlist-statusText">
                      {attendanceConfirmed
                        ? `已确认到场${p.session_xp ? ` · +${p.session_xp} XP` : ''}`
                        : hasCheckedIn
                          ? '已签到，待发起人确认'
                          : '未签到'}
                    </span>
                  )}
                </div>
                {isHostMember && <span className="ui-pages-gamedetail-memberlist-creatorBadge">发起人</span>}
                {showConfirmBtn && (
                  <button
                    className="ui-pages-gamedetail-memberlist-confirmBtn"
                    onClick={() => onConfirmAttendance?.(p.user_id)}
                    disabled={actionLoading}
                  >
                    {actionLoading ? '处理中...' : '确认到场'}
                  </button>
                )}
              </div>

              {/* 迷你资料卡片弹窗 */}
              {showPopup && userId !== 'null' && (
                <div className="member-popup-card ui-pages-gamedetail-memberlist-popupCard" >
                  {popupLoading ? (
                    <div className="ui-pages-gamedetail-memberlist-popupLoading">加载中...</div>
                  ) : popupInfo ? (
                    <>
                      <div className="ui-pages-gamedetail-memberlist-popupHeader">
                        <Avatar name={popupInfo.nickname} url={popupInfo.avatar_url} size={32} />
                        <div>
                          <div className="ui-pages-gamedetail-memberlist-popupName">{popupInfo.nickname}</div>
                          <div className="ui-pages-gamedetail-memberlist-popupDept">{popupInfo.department || '未填写院系'}</div>
                        </div>
                      </div>
                      <div className="ui-pages-gamedetail-memberlist-popupSection">
                        <span className="ui-pages-gamedetail-memberlist-popupSectionTitle">运动偏好</span>
                        <div className="ui-pages-gamedetail-memberlist-popupSportTags">
                          {popupInfo.sport_preferences?.length ? (
                            popupInfo.sport_preferences.map((sp) => (
                              <span key={sp} className="ui-pages-gamedetail-memberlist-popupSportTag">
                                <SportIcon sport={sp} size={14} />
                                {SPORT_LABELS[sp] || sp}
                              </span>
                            ))
                          ) : (
                            <span className="ui-pages-gamedetail-memberlist-popupEmpty">未设置</span>
                          )}
                        </div>
                      </div>
                      {Number(p.user_id) !== Number(currentUser?.id) && (
                        <div className="ui-pages-gamedetail-memberlist-popupActions">
                          <AddFriendButton
                            target={{
                              user_id: Number(p.user_id),
                              nickname: popupInfo.nickname,
                              avatar_url: popupInfo.avatar_url,
                              department: popupInfo.department,
                              sport_preferences: popupInfo.sport_preferences,
                            }}
                            status={friendStatus?.get(Number(p.user_id)) || 'none'}
                            sourceGameId={gameId ? Number(gameId) : undefined}
                            onStatusChange={() => onSocialChanged?.()}
                          />
                          <div className="ui-pages-gamedetail-memberlist-popupSafety">
                            <button
                              type="button"
                              onClick={() => setReportFor({ user_id: Number(p.user_id), nickname: popupInfo.nickname })}
                            >
                              举报
                            </button>
                            <button
                              type="button"
                              onClick={() => setBlockFor({ user_id: Number(p.user_id), nickname: popupInfo.nickname })}
                            >
                              拉黑
                            </button>
                            {isCreator && gameId && ['recruiting', 'full', 'ready'].includes(gameState || '') && (
                              <button
                                type="button"
                                onClick={() => setRemoveFor({ user_id: Number(p.user_id), nickname: popupInfo.nickname })}
                              >
                                请他离局
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="ui-pages-gamedetail-memberlist-popupLoading">加载失败</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {reportFor && (
        <ReportDialog
          targetType="user"
          targetId={reportFor.user_id}
          targetName={reportFor.nickname}
          reasons={REPORT_REASONS_USER}
          onClose={() => setReportFor(null)}
        />
      )}
      {blockFor && (
        <BlockConfirmDialog
          user={blockFor}
          onClose={() => setBlockFor(null)}
          onBlocked={() => { setPopupUserId(null); setPopupInfo(null); onSocialChanged?.(); }}
        />
      )}
      {removeFor && gameId && (
        <RemoveMemberDialog
          gameId={gameId}
          gameStartTime={gameStartTime || ''}
          member={removeFor}
          onClose={() => setRemoveFor(null)}
          onRemoved={() => { setPopupUserId(null); setPopupInfo(null); onRemoved?.(); }}
        />
      )}
    </div>
  );
};



export default MemberList;
