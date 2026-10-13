import {Icon} from '../../features/motion/components/Icons';
/**
 * Admin —— 管理后台入口
 * 鉴权检查 + 顶部栏 + Tab 导航 + 子面板切换
 * 移动端优先，桌面端表格（见 design-system.css）
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import Dashboard from './Dashboard';
import UserList from './UserList';
import GameList from './GameList';
import VenueList from './VenueList';
import FeedbackList from './FeedbackList';


type AdminTab = 'dashboard' | 'users' | 'games' | 'venues' | 'feedback';

const TABS: { key: AdminTab; label: string }[] = [
  { key: 'dashboard', label: '概览' },
  { key: 'users', label: '用户' },
  { key: 'games', label: '活动' },
  { key: 'venues', label: '场地' },
  { key: 'feedback', label: '反馈' },
];

const Admin: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number>(0);

  useEffect(() => {
    client
      .get('/admin/me')
      .then((r: any) => {
        setAuthorized(true);
        setCurrentUserId(Number(r.data.user_id) || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="admin-page">
        <div className="admin-loading"><div className="spinner" /></div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="admin-page">
        <div className="ui-pages-admin-admin-inline-0">
          <Icon name="lock" size={44}/>
          <h2 className="ui-pages-admin-admin-inline-1">无管理员权限</h2>
          <p className="ui-pages-admin-admin-inline-2">
            你不是管理员，无法访问此页面。
          </p>
          <button className="btn btn--primary btn--sm" onClick={() => navigate('/')}>
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      {/* 顶部栏 */}
      <div className="admin-topbar">
        <h1 className="admin-topbar__title">管理后台</h1>
        <button className="admin-topbar__back" onClick={() => navigate('/')}>
          返回前台
        </button>
      </div>

      <p className="admin-intro">维护校园运动社区的日常运行。</p>

      {/* Tab 导航 */}
      <div className="admin-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`admin-tab ${tab === t.key ? 'admin-tab--active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
        <div className="admin-tabs__fade" />
      </div>

      {/* 内容区 */}
      <div className="admin-content">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'users' && <UserList currentUserId={currentUserId} />}
        {tab === 'games' && <GameList />}
        {tab === 'venues' && <VenueList />}
        {tab === 'feedback' && <FeedbackList />}
      </div>
    </div>
  );
};

export default Admin;
