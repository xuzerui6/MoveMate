/**
 * 倒计时组件 —— 显示距离运动局开始还有多久
 * 状态：紧急(<30min 红色) / 临近(30-60min 黄色) / 正常(>60min 灰色)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Clock } from '@phosphor-icons/react/dist/csr/Clock';

interface Props {
  startTime: string; // ISO 时间字符串
}

interface TimeLeft {
  hours: number;
  minutes: number;
  totalMinutes: number;
  isPast: boolean;
}

function calcTimeLeft(startTime: string): TimeLeft {
  const now = Date.now();
  const start = new Date(startTime).getTime();
  const diff = start - now;
  const isPast = diff <= 0;
  const absDiff = Math.abs(diff);
  const totalMinutes = Math.floor(absDiff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return { hours, minutes, totalMinutes, isPast };
}

const CountdownBadge: React.FC<Props> = ({ startTime }) => {
  const [time, setTime] = useState<TimeLeft>(() => calcTimeLeft(startTime));

  const update = useCallback(() => {
    setTime(calcTimeLeft(startTime));
  }, [startTime]);

  useEffect(() => {
    update();
    const timer = setInterval(update, 30000); // 30 秒更新一次
    return () => clearInterval(timer);
  }, [update]);

  // 已过期：不显示
  if (time.isPast) {
    return (
      <span className="countdown-badge countdown-badge--urgent">
        已开始
      </span>
    );
  }

  // 紧急：< 30 分钟
  const isUrgent = time.totalMinutes < 30;
  // 临近：30-60 分钟
  const isWarning = time.totalMinutes >= 30 && time.totalMinutes < 60;

  let className = 'countdown-badge countdown-badge--normal';
  if (isUrgent) className = 'countdown-badge countdown-badge--urgent';
  else if (isWarning) className = 'countdown-badge countdown-badge--warning';

  const text =
    time.hours > 0
      ? `${time.hours}小时${time.minutes}分钟后开始`
      : `${time.minutes}分钟后开始`;

  return (
    <span className={className}>
      <Clock size={15} aria-hidden="true" />
      {text}
    </span>
  );
};

export default CountdownBadge;
