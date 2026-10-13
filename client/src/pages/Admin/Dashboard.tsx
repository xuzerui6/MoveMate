import {Icon} from '../../features/motion/components/Icons';
/**
 * Dashboard —— 管理后台概览
 * 统计卡片：emoji 图标 + 数值 + 标签，Grid 响应式
 */
import React, { useEffect, useState } from 'react';
import client, {getErrorMessage} from '../../api/client';

interface Stats {
  total_users: number;
  total_games: number;
  today_users: number;
  today_games: number;
  active_users_7d: number;
  pending_feedback: number;
}

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);

  const [error,setError]=useState('');
  const load=()=>{setError('');client.get('/admin/stats').then((r:any)=>setStats(r.data)).catch(e=>setError(getErrorMessage(e)));};
  useEffect(load,[]);
  if(error)return <div className="empty-state" role="alert"><p>{error}</p><button className="btn btn--primary" onClick={load}>重试</button></div>;

  if (!stats) {
    return (
      <div className="admin-loading">
        <div className="spinner" />
      </div>
    );
  }

  const cards = [
    { icon: 'users', label: '总用户', value: stats.total_users, color: 'var(--color-accent)' },
    { icon: 'basketball', label: '总局数', value: stats.total_games, color: 'var(--color-success)' },
    { icon: 'user', label: '今日新用户', value: stats.today_users, color: 'var(--color-warning)' },
    { icon: 'bolt', label: '今日新局', value: stats.today_games, color: '#8B5CF6' },
    { icon: 'flame', label: '7日活跃', value: stats.active_users_7d, color: '#EC4899' },
    { icon: 'bell', label: '待处理反馈', value: stats.pending_feedback, color: 'var(--color-error)', alert: stats.pending_feedback > 0 },
  ];

  return (
    <section><div className="admin-section-head"><h2>社区概览</h2><time>{new Date().toLocaleDateString('zh-CN')}</time></div><div className="admin-stats">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`admin-stat-card ${c.alert ? 'admin-stat-card--alert' : ''}`}
        >
          <div className="admin-stat-card__icon"><Icon name={c.icon} size={28}/></div>
          <div className="admin-stat-card__value" style={{ color: c.color }}>
            {c.value}
          </div>
          <div className="admin-stat-card__label">{c.label}</div>
        </div>
      ))}
    </div><p className="admin-access-note"><Icon name="lock" size={18}/>仅现有管理员可访问。普通演示账号保持无权限。</p></section>
  );
};

export default Dashboard;
