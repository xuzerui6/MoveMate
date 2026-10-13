import Dialog from '../../components/Dialog';
/**
 * 发起人操作按钮 —— 取消 / 确认开始 / 确认结束
 * 仅发起人可见
 */
import React, { useState } from 'react';

interface Props {
  isCreator: boolean;
  gameState: string;
  onJoin: () => void;
  onLeave: () => void;
  onCancel: () => void;
  onConfirmStart: () => void;
  onConfirmEnd: () => void;
  onCheckIn: () => void;
  isMember: boolean;
  hasCheckedIn: boolean;
  attendanceConfirmed: boolean;
  actionLoading: boolean;
}

type ConfirmType = 'cancel' | 'leave' | 'end' | null;

const HostActions: React.FC<Props> = ({
  isCreator,
  gameState,
  onJoin,
  onLeave,
  onCancel,
  onConfirmStart,
  onConfirmEnd,
  onCheckIn,
  isMember,
  hasCheckedIn,
  attendanceConfirmed,
  actionLoading,
}) => {
  const [confirmType, setConfirmType] = useState<ConfirmType>(null);

  const handleConfirm = () => {
    if (confirmType === 'cancel') onCancel();
    if (confirmType === 'leave') onLeave();
    if (confirmType === 'end') onConfirmEnd();
    setConfirmType(null);
  };

  const canJoin = !isMember && !isCreator && gameState === 'recruiting';
  const showLockedHint = !isMember && !isCreator && (
    gameState === 'full' ||
    gameState === 'ready' ||
    gameState === 'in_progress'
  );

  return (
    <div className="ui-pages-gamedetail-hostactions-container">
      {/* ---- 页面内确认弹层 ---- */}
      {confirmType && (
        <Dialog title={confirmType==='cancel'?'取消活动':confirmType==='end'?'结束整场活动？':'退出活动'} onClose={()=>setConfirmType(null)}>
            <p className="ui-pages-gamedetail-hostactions-confirmText">
              {confirmType === 'end'?'活动结束后会关闭仍在进行的个人计时，按已确认到场成员的有效运动量结算。':confirmType === 'cancel'
                ? '确定要取消这个局吗？取消后无法恢复。'
                : '确定要退出这个局吗？'}
            </p>
            <div className="ui-pages-gamedetail-hostactions-confirmActions">
              <button
                className="ui-pages-gamedetail-hostactions-confirmCancelBtn"
                onClick={() => setConfirmType(null)}
              >
                再想想
              </button>
              <button
                className="ui-pages-gamedetail-hostactions-confirmDangerBtn"
                onClick={handleConfirm}
              >
                {confirmType === 'end'?'确认结束活动':confirmType === 'cancel' ? '确认取消' : '确认退出'}
              </button>
            </div>
        </Dialog>
      )}

      {/* ---- 非成员且非发起人：加入按钮 ---- */}
      {canJoin && (
        <button
          className="btn btn--primary btn--lg btn--block"
          onClick={onJoin}
          disabled={actionLoading}
        >
          {actionLoading ? '处理中...' : '加入这个局'}
        </button>
      )}

      {showLockedHint && (
        <p className="ui-pages-gamedetail-hostactions-closedHint">
          {gameState === 'full'
            ? '该局已满员，暂时不能加入'
            : gameState === 'ready'
              ? '该局即将开始，已停止加入'
              : '该局已开始，不能再加入'}
        </p>
      )}

      {/* ---- 成员（非发起人）：退出按钮 ---- */}
      {isMember && !isCreator && (
        <div className="ui-pages-gamedetail-hostactions-memberActions">
          {(gameState === 'ready' || gameState === 'in_progress') && (
            <button
              
              onClick={onCheckIn}
              disabled={actionLoading || hasCheckedIn}
              className={[hasCheckedIn ? 'btn btn--secondary btn--block' : 'btn btn--primary btn--block',"ui-pages-gamedetail-hostactions-inline-0"].filter(Boolean).join(" ")}
            >
              {hasCheckedIn ? (attendanceConfirmed ? '已确认到场' : '已签到，待确认') : '我已到场'}
            </button>
          )}
          {['recruiting', 'full', 'ready'].includes(gameState) && <button
            className="btn btn--outline btn--lg btn--block"
            onClick={() => setConfirmType('leave')}
            disabled={actionLoading}
          >
            {actionLoading ? '处理中...' : '退出这个局'}
          </button>}
        </div>
      )}

      {/* ---- 发起人操作 ---- */}
      {isCreator && (
        <div className="ui-pages-gamedetail-hostactions-creatorActions">
          {(gameState === 'ready' || gameState === 'in_progress') && (
            <button
              
              onClick={onCheckIn}
              disabled={actionLoading || hasCheckedIn}
              className={[hasCheckedIn ? 'btn btn--secondary btn--block' : 'btn btn--primary btn--block',"ui-pages-gamedetail-hostactions-inline-1"].filter(Boolean).join(" ")}
            >
              {hasCheckedIn ? '你已签到' : '发起人签到'}
            </button>
          )}
          {/* 招募中 / 满员 / 即将开始 → 可取消 */}
          {(gameState === 'recruiting' ||
            gameState === 'full' ||
            gameState === 'ready') && (
            <button
              
              onClick={() => setConfirmType('cancel')}
              disabled={actionLoading}
              className={["btn btn--danger btn--block","ui-pages-gamedetail-hostactions-inline-2"].filter(Boolean).join(" ")}
            >
              {actionLoading ? '处理中...' : '取消该局'}
            </button>
          )}

          {/* 即将开始 → 确认开始 */}
          {gameState === 'ready' && (
            <button
              
              onClick={onConfirmStart}
              disabled={actionLoading}
              className={["btn btn--primary btn--block","ui-pages-gamedetail-hostactions-inline-3"].filter(Boolean).join(" ")}
            >
              {actionLoading ? '处理中...' : '确认活动开始'}
            </button>
          )}

          {/* 进行中 → 确认结束 */}
          {gameState === 'in_progress' && (
            <button
              className="btn btn--primary btn--block"
              onClick={()=>setConfirmType('end')}
              disabled={actionLoading}
            >
              {actionLoading ? '处理中...' : '确认活动结束'}
            </button>
          )}
        </div>
      )}

      {/* ---- 已结束/已取消/已归档：不显示操作 ---- */}
      {(gameState === 'completed' || gameState === 'cancelled' || gameState === 'archived') && (
        <p className="ui-pages-gamedetail-hostactions-closedHint">该局已结束</p>
      )}
    </div>
  );
};



export default HostActions;
