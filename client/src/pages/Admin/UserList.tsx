/**
 * UserList —— 用户管理（最复杂的面板）
 * - 移动端卡片 / 桌面端表格
 * - 当前用户：蓝色竖线 + 「管理员 · 你」标识，操作按钮禁用
 * - 所有危险操作走 ConfirmDialog
 */
import React, { useCallback, useEffect, useState } from 'react';
import client, {getErrorMessage} from '../../api/client';
import { showToast } from '../../hooks/useAuth';
import Avatar from '../../components/Avatar';
import ConfirmDialog from './components/ConfirmDialog';
import Pagination from './components/Pagination';
import UserDetailDialog from './components/UserDetailDialog';

interface AdminUser {
  id: number;
  nickname: string;
  email: string;
  avatar_url: string;
  department: string;
  is_admin: number;
  reward_points: number;
  reward_level: number;
  created_at: string;
  campus_name: string;
}

const PAGE_SIZE = 20;

const UserList: React.FC<{ currentUserId: number }> = ({ currentUserId }) => {
  const [loadError,setLoadError]=useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [promoteTarget, setPromoteTarget] = useState<AdminUser | null>(null);
  const [demoteTarget, setDemoteTarget] = useState<AdminUser | null>(null);
  const [detailUserId, setDetailUserId] = useState<number | null>(null);

  // 头像：统一 Avatar 组件，点击自动弹大图预览

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const r: any = await client.get('/admin/users', { params: { page: p, search: search || undefined } });
      setLoadError('');setUsers(r.data.list);
      setTotal(r.data.total);
      setPage(r.data.page);
    } catch (e) {setLoadError(getErrorMessage(e));} finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(1); }, [load]);

  const isSelf = (u: AdminUser) => String(u.id) === String(currentUserId);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await client.delete(`/admin/users/${deleteTarget.id}`);
      showToast('用户已删除', 'success');
      setDeleteTarget(null);
      load(page);
    } catch (e: any) {
      showToast(e?.response?.data?.message || '删除失败', 'error');
      setDeleteTarget(null);
    }
  };

  const confirmDemote = async () => {
    if (!demoteTarget) return;
    try {
      await client.put(`/admin/users/${demoteTarget.id}`, { is_admin: false });
      showToast('已取消管理员', 'success');
      setDemoteTarget(null);
      load(page);
    } catch (e: any) {
      showToast(e?.response?.data?.message || '操作失败', 'error');
      setDemoteTarget(null);
    }
  };

  const confirmPromote = async () => {
    if (!promoteTarget) return;
    try {
      await client.put(`/admin/users/${promoteTarget.id}`, { is_admin: true });
      showToast('已设为管理员', 'success');
      setPromoteTarget(null);
      load(page);
    } catch (e: any) {
      showToast(e?.response?.data?.message || '操作失败', 'error');
      setPromoteTarget(null);
    }
  };

  const renderActions = (u: AdminUser) => {
    const self = isSelf(u);
    return (
      <div className="ui-pages-admin-userlist-inline-0">
        {u.is_admin ? (
          <button
            className={`admin-action-btn ${self ? 'admin-action-btn--disabled' : ''}`}
            disabled={self}
            title={self ? '不能取消自己的管理员身份' : undefined}
            onClick={() => setDemoteTarget(u)}
          >
            取消管理员
          </button>
        ) : (
          <button
            className="admin-action-btn"
            onClick={() => setPromoteTarget(u)}
          >
            设管理员
          </button>
        )}
        <button
          className={`admin-action-btn admin-action-btn--danger ${self ? 'admin-action-btn--disabled' : ''}`}
          disabled={self}
          title={self ? '不能删除自己' : undefined}
          onClick={() => setDeleteTarget(u)}
        >
          删除
        </button>
      </div>
    );
  };

  const fmtDate = (d: string) =>
    d ? new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-';

  return (
    <div>
      <div className="admin-filter-row">
        <input
          className="form-input"
          placeholder="搜索昵称 / 邮箱"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(1)}
        />
        <button className="btn btn--secondary btn--sm" onClick={() => load(1)}>搜索</button>
      </div>

      {loading ? (
        <div className="admin-loading"><div className="spinner" /></div>
      ) : users.length === 0 ? (
        <div className="admin-empty">没有找到用户</div>
      ) : (
        <>
          {/* 移动端卡片 */}
          <div className="admin-cards">
            {users.map((u) => {
              const self = isSelf(u);
              return (
                <div key={u.id} className={`admin-item-card ${self ? 'admin-item-card--self' : ''}`}>
                  <div className="admin-item-card__head">
                    <span className="ui-pages-admin-userlist-inline-1">
                      <Avatar name={u.nickname} url={u.avatar_url} size={40} />
                      <span className="ui-pages-admin-userlist-inline-2">
                        <button
                          
                          className={["admin-item-card__title","ui-pages-admin-userlist-inline-3"].filter(Boolean).join(" ")}
                          onClick={() => setDetailUserId(u.id)}
                        >
                          {u.nickname} <span className="ui-pages-admin-userlist-inline-4">#{u.id}</span>
                        </button>
                      </span>
                    </span>
                    <span className="ui-pages-admin-userlist-inline-5">
                      {u.is_admin && <span className="admin-badge admin-badge--admin">管理员</span>}
                      {self && <span className="admin-badge admin-badge--you">你</span>}
                    </span>
                  </div>
                  <div className="admin-item-card__meta">
                    <span> {u.email}</span>
                  </div>
                  <div className="admin-item-card__meta">
                    <span>{u.department || '-'}{u.campus_name ? ` / ${u.campus_name}` : ''}</span>
                  </div>
                  <div className="admin-item-card__meta">
                    <span> 历史 {u.reward_points} 分 · Lv.{u.reward_level}</span>
                    <span> {fmtDate(u.created_at)}</span>
                  </div>
                  <div className="admin-item-card__actions">
                    {renderActions(u)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 桌面端表格 */}
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>ID</th><th>用户</th><th>邮箱</th><th>院系/校区</th><th>历史积分</th><th>管理员</th><th>注册时间</th><th>操作</th></tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const self = isSelf(u);
                  if(loadError)return <div className="empty-state" role="alert"><h3>暂时无法加载</h3><p>{loadError}</p><button className="btn btn--primary" onClick={()=>void load(page)}>重试</button></div>;
  return (
                    <tr key={u.id} className={self ? 'admin-row--self' : ''}>
                      <td>{u.id}</td>
                      <td>
                        <span className="ui-pages-admin-userlist-inline-6">
                          <Avatar name={u.nickname} url={u.avatar_url} size={32} />
                          <button
                            className="ui-pages-admin-userlist-inline-7"
                            onClick={() => setDetailUserId(u.id)}
                          >
                            {u.nickname}
                          </button>
                          {self && <span className="ui-pages-admin-userlist-inline-8">(你)</span>}
                        </span>
                      </td>
                      <td className="ui-pages-admin-userlist-inline-9">{u.email}</td>
                      <td className="ui-pages-admin-userlist-inline-10">{u.department || '-'}{u.campus_name ? ` / ${u.campus_name}` : ''}</td>
                      <td>{u.reward_points}</td>
                      <td>
                        {u.is_admin
                          ? <span className="admin-badge admin-badge--admin">管理员</span>
                          : <span className="ui-pages-admin-userlist-inline-11">-</span>}
                      </td>
                      <td className="ui-pages-admin-userlist-inline-12">{fmtDate(u.created_at)}</td>
                      <td>{renderActions(u)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPageChange={load} />
        </>
      )}

      {/* 删除确认 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={`删除用户「${deleteTarget?.nickname || ''}」？`}
        description={
          <ul>
            <li>邮箱：{deleteTarget?.email}</li>
            <li>将同时删除：TA 发起的局、参与记录、聊天消息、通知</li>
            <li>此操作不可恢复！</li>
          </ul>
        }
        confirmText="删除"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* 取消管理员确认 */}
      <ConfirmDialog
        open={demoteTarget !== null}
        title={`取消「${demoteTarget?.nickname || ''}」的管理员身份？`}
        description={<ul><li>取消后 TA 将无法访问管理后台</li></ul>}
        confirmText="取消管理员"
        confirmVariant="primary"
        onConfirm={confirmDemote}
        onCancel={() => setDemoteTarget(null)}
      />

      {/* 设为管理员确认 */}
      <ConfirmDialog
        open={promoteTarget !== null}
        title={`将「${promoteTarget?.nickname || ''}」设为管理员？`}
        description={<ul><li>设置后 TA 将可以管理用户、局、场地和反馈</li></ul>}
        confirmText="设为管理员"
        confirmVariant="primary"
        onConfirm={confirmPromote}
        onCancel={() => setPromoteTarget(null)}
      />

      {/* 用户详情弹窗 */}
      {detailUserId !== null && (
        <UserDetailDialog userId={detailUserId} onClose={() => setDetailUserId(null)} />
      )}
    </div>
  );
};

export default UserList;
