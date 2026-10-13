/**
 * ConfirmDialog —— 通用确认弹窗（替代原生 confirm）
 * 手机端底部弹出，桌面端居中。遮罩点击关闭。
 */
import React from 'react';
import Dialog from '../../../components/Dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** danger = 红色危险操作 / primary = 深色常规操作 */
  confirmVariant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmText = '确定',
  cancelText = '取消',
  confirmVariant = 'danger',
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <Dialog title={title} onClose={onCancel}>
        {description && <div className="admin-dialog__desc">{description}</div>}
        <div className="admin-dialog__actions">
          <button className="btn btn--secondary btn--sm" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            className={`btn ${confirmVariant === 'danger' ? 'btn--danger' : 'btn--primary'} btn--sm`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
    </Dialog>
  );
};

export default ConfirmDialog;
