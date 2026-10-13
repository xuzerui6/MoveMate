import Dialog from '../../components/Dialog';
/**
 * VenueList —— 场地管理
 * 运动类型用 Chip 多选（替代手写 JSON）；移动端卡片 / 桌面端表格；编辑弹窗
 */
import React, { useCallback, useEffect, useState } from 'react';
import client, {getErrorMessage} from '../../api/client';
import { showToast } from '../../hooks/useAuth';
import { COMMON_SPORT_TYPES, SPORT_LABELS } from '../../types';
import ConfirmDialog from './components/ConfirmDialog';

interface AdminVenue {
  id: number;
  school_id: number;
  campus_id: number;
  name: string;
  sport_types: string;
  is_active: number;
  school_name: string;
  campus_name: string;
}

interface VenueForm {
  campus_id: number;
  name: string;
  sportTypes: string[];
  is_active: boolean;
}

const CAMPUSES = [
  { id: 1, name: '前卫南区' },
  { id: 2, name: '北苑校区' },
  { id: 3, name: '新民校区' },
];

const EMPTY_FORM: VenueForm = { campus_id: 1, name: '', sportTypes: [], is_active: true };

const VenueList: React.FC = () => {
  const [saving,setSaving]=useState(false);
  const [loadError,setLoadError]=useState('');
  const [venues, setVenues] = useState<AdminVenue[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<{ venue: AdminVenue | null; form: VenueForm } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminVenue | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r: any = await client.get('/admin/venues');
      setLoadError('');setVenues(r.data);
    } catch (e) {setLoadError(getErrorMessage(e));} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const parseSportTypes = (raw: string): string[] => {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  };

  const toggleSport = (s: string) => {
    if (!editing) return;
    setEditing((prev) => {
      if (!prev) return prev;
      const has = prev.form.sportTypes.includes(s);
      return {
        ...prev,
        form: {
          ...prev.form,
          sportTypes: has ? prev.form.sportTypes.filter((x) => x !== s) : [...prev.form.sportTypes, s],
        },
      };
    });
  };

  const save = async () => {
    if (!editing||saving) return;
    if (!editing.form.name.trim()) {
      showToast('场地名必填', 'error');
      return;
    }
    const payload = {
      school_id: 1,
      campus_id: editing.form.campus_id,
      name: editing.form.name.trim(),
      sport_types: editing.form.sportTypes,
      is_active: editing.form.is_active,
    };
    setSaving(true);
    try {
      if (editing.venue) await client.put(`/admin/venues/${editing.venue.id}`, payload);
      else await client.post('/admin/venues', payload);
      showToast('已保存', 'success');
      setEditing(null);
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.message || '保存失败', 'error');
    } finally {setSaving(false);}
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await client.delete(`/admin/venues/${deleteTarget.id}`);
      showToast('场地已删除', 'success');
      setDeleteTarget(null);
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.message || '删除失败', 'error');
      setDeleteTarget(null);
    }
  };

  if(loadError)return <div className="empty-state" role="alert"><h3>暂时无法加载</h3><p>{loadError}</p><button className="btn btn--primary" onClick={()=>void load()}>重试</button></div>;
  return (
    <div>
      <div className="ui-pages-admin-venuelist-inline-0">
        <button
          className="btn btn--primary btn--sm"
          onClick={() => setEditing({ venue: null, form: { ...EMPTY_FORM } })}
        >
          + 添加场地
        </button>
      </div>

      {loading ? (
        <div className="admin-loading"><div className="spinner" /></div>
      ) : venues.length === 0 ? (
        <div className="admin-empty">暂无场地</div>
      ) : (
        <>
          {/* 移动端卡片 */}
          <div className="admin-cards">
            {venues.map((v) => (
              <div key={v.id} className="admin-item-card">
                <div className="admin-item-card__head">
                  <span className="admin-item-card__title">{v.name}</span>
                  {v.is_active
                    ? <span className="admin-badge admin-badge--active">启用</span>
                    : <span className="admin-badge admin-badge--inactive">停用</span>}
                </div>
                <div className="admin-item-card__meta">
                  <span> {v.campus_name || '-'}</span>
                </div>
                <div className="admin-item-card__meta">
                  <span>
                    {parseSportTypes(v.sport_types).length > 0
                      ? parseSportTypes(v.sport_types).map((s) => SPORT_LABELS[s] || s).join(' · ')
                      : '未设置运动类型'}
                  </span>
                </div>
                <div className="admin-item-card__actions">
                  <button
                    className="admin-action-btn"
                    onClick={() =>
                      setEditing({ venue: v, form: { campus_id: v.campus_id, name: v.name, sportTypes: parseSportTypes(v.sport_types), is_active: !!v.is_active } })
                    }
                  >
                    编辑
                  </button>
                  <button className="admin-action-btn admin-action-btn--danger" onClick={() => setDeleteTarget(v)}>
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
                <tr><th>ID</th><th>名称</th><th>校区</th><th>运动类型</th><th>状态</th><th>操作</th></tr>
              </thead>
              <tbody>
                {venues.map((v) => (
                  <tr key={v.id}>
                    <td>{v.id}</td>
                    <td className="ui-pages-admin-venuelist-inline-1">{v.name}</td>
                    <td>{v.campus_name || '-'}</td>
                    <td className="ui-pages-admin-venuelist-inline-2">
                      {parseSportTypes(v.sport_types).length > 0
                        ? parseSportTypes(v.sport_types).map((s) => SPORT_LABELS[s] || s).join(' · ')
                        : '未设置'}
                    </td>
                    <td>
                      {v.is_active
                        ? <span className="admin-badge admin-badge--active">启用</span>
                        : <span className="admin-badge admin-badge--inactive">停用</span>}
                    </td>
                    <td>
                      <button
                        className="admin-action-btn"
                        onClick={() =>
                          setEditing({ venue: v, form: { campus_id: v.campus_id, name: v.name, sportTypes: parseSportTypes(v.sport_types), is_active: !!v.is_active } })
                        }
                      >
                        编辑
                      </button>
                      <button className="admin-action-btn admin-action-btn--danger" onClick={() => setDeleteTarget(v)}>
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 编辑弹窗 */}
      {editing && (
        <Dialog title={editing.venue?'编辑场地':'添加场地'} onClose={()=>{if(!saving)setEditing(null);}}>

            <div className="admin-form-group">
              <label className="admin-form-label">场地名称 *</label>
              <input
                className="form-input" aria-label="场地名称"
                placeholder="如：体育馆羽毛球场"
                value={editing.form.name}
                onChange={(e) => setEditing((p) => p && { ...p, form: { ...p.form, name: e.target.value } })}
              />
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">校区</label>
              <select
                className="form-select" aria-label="校区"
                value={editing.form.campus_id}
                onChange={(e) => setEditing((p) => p && { ...p, form: { ...p.form, campus_id: parseInt(e.target.value) } })}
              >
                {CAMPUSES.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">支持的运动（可多选）</label>
              <div className="admin-chips">
                {COMMON_SPORT_TYPES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`admin-chip ${editing.form.sportTypes.includes(s) ? 'admin-chip--active' : ''}`}
                    onClick={() => toggleSport(s)}
                  >
                    {SPORT_LABELS[s] || s}
                  </button>
                ))}
              </div>
            </div>

            <div  className={["admin-form-group","ui-pages-admin-venuelist-inline-3"].filter(Boolean).join(" ")}>
              <input
                type="checkbox"
                id="venue-active"
                checked={editing.form.is_active}
                onChange={(e) => setEditing((p) => p && { ...p, form: { ...p.form, is_active: e.target.checked } })}
              />
              <label htmlFor="venue-active"  className={["admin-form-label","ui-pages-admin-venuelist-inline-4"].filter(Boolean).join(" ")}>启用</label>
            </div>

            <div className="admin-dialog__actions">
              <button className="btn btn--secondary btn--sm" onClick={() => setEditing(null)}>取消</button>
              <button className="btn btn--primary btn--sm" disabled={saving} onClick={save}>{saving?'正在保存…':'保存'}</button>
            </div>
        </Dialog>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`删除场地「${deleteTarget?.name || ''}」？`}
        description={<ul><li>删除后场地将无法在发局时选择</li><li>此操作不可恢复</li></ul>}
        confirmText="删除"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default VenueList;
