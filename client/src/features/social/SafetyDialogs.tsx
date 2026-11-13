/**
 * 安全小界面（设计稿第 6 组）：举报 / 拉黑 / 请人离局。
 * 文案全部按设计稿的大白话：举报带记录、对方不知情；拉黑先把后果说清；
 * 请人离局说法中性，开局前 30 分钟锁定。
 */
import React, { useState } from 'react';
import Dialog from '../../components/Dialog';
import * as socialApi from '../../api/social';
import * as gamesApi from '../../api/games';
import { getErrorMessage } from '../../api/client';
import { showToast } from '../../hooks/useAuth';
import { removalLock } from './socialLogic';
import './social.css';

/* ---------- 举报 ---------- */

interface ReportProps {
  targetType: 'user' | 'message' | 'game';
  targetId: string | number;
  targetName: string;
  reasons: readonly string[];
  onClose: () => void;
}

export const ReportDialog: React.FC<ReportProps> = ({ targetType, targetId, targetName, reasons, onClose }) => {
  const [reason, setReason] = useState<string>(reasons[0] || '');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      await socialApi.createReport({ targetType, targetId, reason });
      setDone(true);
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog title={`举报${targetName}`} onClose={onClose}>
      {done ? (
        <>
          <p className="social-dialog-text">收到了，管理员看完会把结果告诉你。</p>
          <div className="social-dialog-actions">
            <button className="btn btn--primary" onClick={onClose}>知道了</button>
          </div>
        </>
      ) : (
        <>
          <p className="social-dialog-text">选一个最接近的原因就行，不用写小作文。</p>
          <div className="social-reason-list" role="radiogroup" aria-label="举报原因">
            {reasons.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={reason === r}
                className={`social-reason${reason === r ? ' social-reason--active' : ''}`}
                onClick={() => setReason(r)}
              >
                {r}
              </button>
            ))}
          </div>
          <p className="social-dialog-note">举报会带上相关记录，管理员会看。对方不会知道是谁举报的。</p>
          <div className="social-dialog-actions">
            <button className="btn btn--secondary" onClick={onClose} disabled={submitting}>先不了</button>
            <button className="btn btn--primary" onClick={() => void submit()} disabled={submitting}>
              {submitting ? '提交中...' : '提交举报'}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
};

/* ---------- 拉黑 ---------- */

interface BlockProps {
  user: { user_id: number; nickname: string };
  onClose: () => void;
  onBlocked: () => void;
}

export const BlockConfirmDialog: React.FC<BlockProps> = ({ user, onClose, onBlocked }) => {
  const [submitting, setSubmitting] = useState(false);

  const confirm = async () => {
    setSubmitting(true);
    try {
      await socialApi.blockUser(user.user_id);
      showToast(`已拉黑${user.nickname}`, 'success');
      onBlocked();
      onClose();
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog title={`把${user.nickname}拉黑？`} onClose={onClose}>
      <p className="social-dialog-text">拉黑以后会这样：</p>
      <ul className="social-block-list">
        <li>对方不能加你为好友</li>
        <li>对方不能进你发起的局</li>
        <li>在别人的局里，你看不到他的发言</li>
      </ul>
      <p className="social-dialog-note">他不会收到提醒。以后想改回来，在「我的」页面里能找到。</p>
      <div className="social-dialog-actions">
        <button className="btn btn--secondary" onClick={onClose} disabled={submitting}>再想想</button>
        <button className="btn btn--danger" onClick={() => void confirm()} disabled={submitting}>
          {submitting ? '处理中...' : '确认拉黑'}
        </button>
      </div>
    </Dialog>
  );
};

/* ---------- 请人离局（发起人） ---------- */

interface RemoveProps {
  gameId: string;
  gameStartTime: string;
  member: { user_id: number; nickname: string };
  onClose: () => void;
  onRemoved: () => void;
}

export const RemoveMemberDialog: React.FC<RemoveProps> = ({ gameId, gameStartTime, member, onClose, onRemoved }) => {
  const [submitting, setSubmitting] = useState(false);
  const lock = removalLock(gameStartTime);

  const confirm = async () => {
    setSubmitting(true);
    try {
      await gamesApi.removeMember(gameId, member.user_id);
      showToast('已请对方离局', 'success');
      onRemoved();
      onClose();
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog title={`请${member.nickname}离开这个局？`} onClose={onClose}>
      <p className="social-dialog-text">
        不用当面开口。我们会发一条通知给他，只说「本局人员有调整」，不会写是谁请的、为什么。
      </p>
      {lock.locked ? (
        <>
          <div className="social-dialog-actions">
            <button className="btn btn--primary" disabled>请他离局</button>
            <button className="btn btn--secondary" onClick={onClose}>先不了</button>
          </div>
          <p className="social-dialog-note">离开始不到 30 分钟了，这个时候就不能请人离局了——人家可能已经在路上了。</p>
        </>
      ) : (
        <div className="social-dialog-actions">
          <button className="btn btn--secondary" onClick={onClose} disabled={submitting}>先不了</button>
          <button className="btn btn--danger" onClick={() => void confirm()} disabled={submitting}>
            {submitting ? '处理中...' : '请他离局'}
          </button>
        </div>
      )}
    </Dialog>
  );
};
