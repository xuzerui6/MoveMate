/**
 * 空状态提示 —— 当大厅没有局时展示
 */
import React from 'react';
import {Icon} from '../../features/motion/components/Icons';

interface Props {
  onAction?: () => void;
  error?: string;
}

const EmptyState: React.FC<Props> = ({ onAction,error }) => {
  return (
    <div className="empty-state">
      <div className="empty-state__icon"><Icon name="users" size={42}/></div>
      <h3 className="empty-state__title">{error?'运动局暂时加载失败':'还没有运动局'}</h3>
      <p className="empty-state__desc">
        {error||'成为第一个发起运动局的人吧！'}
        <br />
        篮球、羽毛球、跑步... 找搭子一起运动
      </p>
      {onAction && (
        <button className="btn btn--primary btn--lg" onClick={onAction}>
          {error?'重新加载':'发起第一个局'}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
