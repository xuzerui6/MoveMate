/**
 * FeedbackList —— 反馈管理
 * 卡片式列表 + 删除按钮 + ConfirmDialog
 */
import React, { useCallback, useEffect, useState } from 'react';
import client, {getErrorMessage} from '../../api/client';
import { showToast } from '../../hooks/useAuth';
import ConfirmDialog from './components/ConfirmDialog';

interface AdminFeedback {
  id: number;
  user_id: number;
  content: string;
  contact: string;
  created_at: string;
  nickname: string;
  email: string;
}

const FeedbackList: React.FC = () => {
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [list, setList] = useState<AdminFeedback[]>([]);
  const [target, setTarget] = useState<AdminFeedback | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r: any = await client.get('/admin/feedback');
      setLoadError('');setList(r.data);
    } catch (e) {setLoadError(getErrorMessage(e));} finally {setLoading(false);}
  }, []);

  useEffect(() => { load(); }, [load]);

  const confirmDelete = async () => {
    if (!target) return;
    setDeleting(true);
    try {
      await client.delete(`/admin/feedback/${target.id}`);
      showToast('反馈已删除', 'success');
      setTarget(null);
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.message || '删除失败', 'error');
      setTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  if(loading)return <div className="admin-loading">正在读取反馈…</div>;
  if(loadError)return <div className="empty-state" role="alert"><h3>暂时无法加载</h3><p>{loadError}</p><button className="btn btn--primary" onClick={()=>void load()}>重试</button></div>;
  return (
    <div>
      {list.length === 0 ? (
        <div className="admin-empty">暂无反馈</div>
      ) : (
        list.map((f) => (
          <div key={f.id} className="admin-feedback-item">
            <div className="admin-feedback-item__head">
              <div>
                <span className="admin-feedback-item__user">
                  {f.nickname || '匿名'}
                  {f.email ? ` (${f.email})` : ''}
                </span>
              </div>
              <div className="ui-pages-admin-feedbacklist-inline-0">
                <span className="admin-feedback-item__time">
                  {f.created_at ? new Date(f.created_at).toLocaleString('zh-CN', {
                    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  }) : ''}
                </span>
                <button
                  className="admin-action-btn admin-action-btn--danger"
                  onClick={() => setTarget(f)}
                >
                  删除
                </button>
              </div>
            </div>
            <div className="admin-feedback-item__content">{f.content}</div>
            {f.contact && <div className="admin-feedback-item__contact"> {f.contact}</div>}
          </div>
        ))
      )}

      <ConfirmDialog
        open={target !== null}
        title={`删除这条反馈？`}
        description={
          <ul>
            <li>来自：{target?.nickname || '匿名'}（{target?.id}）</li>
            <li>内容：{target?.content?.slice(0, 40)}{(target?.content?.length ?? 0) > 40 ? '…' : ''}</li>
          </ul>
        }
        confirmText="删除"
        onConfirm={confirmDelete}
        onCancel={() => setTarget(null)}
      />
      {deleting && <div className="admin-loading"><div className="spinner" /></div>}
    </div>
  );
};

export default FeedbackList;
