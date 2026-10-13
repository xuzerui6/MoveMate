/**
 * 状态标签 —— 显示运动局的当前状态（招募中/已满员/即将开始...）
 */
import React from 'react';
import type { GameState } from '../types';
import { STATE_LABELS } from '../types';

interface Props {
  state: GameState;
  className?: string;
}

const StateBadge: React.FC<Props> = ({ state, className = '' }) => {
  const label = STATE_LABELS[state] || state;

  return (
    <span className={`state-badge state-badge--${state} ${className}`}>
      {label}
    </span>
  );
};

export default StateBadge;
