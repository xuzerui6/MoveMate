/**
 * GameList —— 局管理
 * 移动端卡片 / 桌面端表格；状态筛选即时响应；删除用 ConfirmDialog
 */
import React, { useCallback, useEffect, useState } from 'react';
import client, {getErrorMessage} from '../../api/client';
import { showToast } from '../../hooks/useAuth';
import { SPORT_LABELS } from '../../types';
import ConfirmDialog from './components/ConfirmDialog';
import Pagination from './components/Pagination';

interface AdminGame {
  id: number;
  title: string;
  sport_type: string;
  status: string;
  creator_name: string;
  campus_name: string;
  venue_name: string;
  start_time: string;
  member_count: number;
  max_players: number;
}

const PAGE_SIZE = 20;

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  recruiting: { label: '组局中', color: '#2563EB', bg: '#EFF6FF' },
  full: { label: '已满员', color: '#6B7280', bg: '#F3F4F6' },
  ready: { label: '即将开始', color: '#D97706', bg: '#FEF3C7' },
  in_progress: { label: '进行中', color: '#10B981', bg: '#ECFDF5' },
  completed: { label: '已完成', color: '#6B7280', bg: '#F3F4F6' },
  archived: { label: '已归档', color: '#94A3B8', bg: '#F8FAFC' },
  cancelled: { label: '已取消', color: '#EF4444', bg: '#FEF2F2' },
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const s = STATUS_MAP[status] || { label: status, color: '#6B7280', bg: '#F3F4F6' };
  return (
    <span className="ui-pages-admin-gamelist-inline-0" style={{color: s.color,background: s.bg}}>
      {s.label}
    </span>
  );
};

const GameList: React.FC = () => {
  const [loadError,setLoadError]=useState('');
  const [games, setGames] = useState<AdminGame[]>([]);
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState<AdminGame | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const r: any = await client.get('/admin/games', { params: { page: p, status } });
      setLoadError('');setGames(r.data.list);
      setTotal(r.data.total);
      setPage(r.data.page);
    } catch (e) {setLoadError(getErrorMessage(e));} finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(1); }, [load]);

  const confirmDelete = async () => {
    if (!target) return;
    try {
      await client.delete(`/admin/games/${target.id}`);
      showToast('局已删除', 'success');
      setTarget(null);
      load(page);
    } catch (e: any) {
      showToast(e?.response?.data?.message || '删除失败', 'error');
      setTarget(null);
    }
  };

  const sportLabel = (s: string) => SPORT_LABELS[s] || s;

  if(loadError)return <div className="empty-state" role="alert"><h3>暂时无法加载</h3><p>{loadError}</p><button className="btn btn--primary" onClick={()=>void load(page)}>重试</button></div>;
  return (
    <div>
      <div className="admin-filter-row">
        <select
          className="form-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">全部状态</option>
          <option value="recruiting">组局中</option>
          <option value="full">已满员</option>
          <option value="ready">即将开始</option>
          <option value="in_progress">进行中</option>
          <option value="completed">已完成</option>
          <option value="cancelled">已取消</option>
        </select>
      </div>

      {loading ? (
        <div className="admin-loading"><div className="spinner" /></div>
      ) : games.length === 0 ? (
        <div className="admin-empty">暂无局</div>
      ) : (
        <>
          {/* 移动端卡片 */}
          <div className="admin-cards">
            {games.map((g) => (
              <div key={g.id} className="admin-item-card">
                <div className="admin-item-card__head">
                  <span className="admin-item-card__title">
                    {sportLabel(g.sport_type)} · {g.title || g.sport_type}
                  </span>
                  <StatusBadge status={g.status} />
                </div>
                <div className="admin-item-card__meta">
                  <span> {g.creator_name || '匿名'}</span>
                  <span> {g.venue_name || '-'}</span>
                  <span> {g.campus_name || '-'}</span>
                </div>
                <div className="admin-item-card__meta">
                  <span> {g.member_count}/{g.max_players}</span>
                  <span> {new Date(g.start_time).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="admin-item-card__actions">
                  <button
                    className="admin-action-btn admin-action-btn--danger"
                    onClick={() => setTarget(g)}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* 桌面端表格 */}
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th><th>标题</th><th>运动</th><th>状态</th>
                  <th>发起人</th><th>场地</th><th>人数</th><th>时间</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                {games.map((g) => (
                  <tr key={g.id}>
                    <td>{g.id}</td>
                    <td className="ui-pages-admin-gamelist-inline-1">{g.title || g.sport_type}</td>
                    <td>{sportLabel(g.sport_type)}</td>
                    <td><StatusBadge status={g.status} /></td>
                    <td>{g.creator_name || '匿名'}</td>
                    <td className="ui-pages-admin-gamelist-inline-2">{g.venue_name || '-'}</td>
                    <td>{g.member_count}/{g.max_players}</td>
                    <td className="ui-pages-admin-gamelist-inline-3">
                      {new Date(g.start_time).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      <button className="admin-action-btn admin-action-btn--danger" onClick={() => setTarget(g)}>
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPageChange={load} />
        </>
      )}

      <ConfirmDialog
        open={target !== null}
        title={`删除「${target ? sportLabel(target.sport_type) + ' · ' + (target.title || target.sport_type) : ''}」？`}
        description={
          <ul>
            <li>发起人：{target?.creator_name || '匿名'}</li>
            <li>删除后：参与记录和聊天消息将一并清除</li>
            <li>此操作不可恢复</li>
          </ul>
        }
        confirmText="删除"
        onConfirm={confirmDelete}
        onCancel={() => setTarget(null)}
      />
    </div>
  );
};

export default GameList;
