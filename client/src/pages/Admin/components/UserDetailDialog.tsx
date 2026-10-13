import Dialog from '../../../components/Dialog';
/**
 * UserDetailDialog —— 用户详情弹窗
 * 管理后台点击用户头像/昵称打开，展示完整资料
 */
import React, { useEffect, useState } from 'react';
import client from '../../../api/client';
import Avatar from '../../../components/Avatar';
import { SPORT_LABELS } from '../../../types';

interface UserDetail {
  id: number;
  nickname: string;
  email: string;
  qq_email: string;
  avatar_url: string;
  department: string;
  student_id: string;
  email_verified: boolean;
  is_admin: number;
  reward_points: number;
  reward_level: number;
  reward_streak: number;
  completed_games: number;
  hosted_completed_games: number;
  reward_badges: string;
  sport_preferences: string;
  created_at: string;
  school_name: string;
  campus_name: string;
}

const parseList = (raw: string): string[] => {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

const UserDetailDialog: React.FC<{ userId: number; onClose: () => void }> = ({ userId, onClose }) => {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    client
      .get(`/admin/users/${userId}`)
      .then((r: any) => setUser(r.data))
      .catch((e: any) => setError(e?.response?.data?.message || '加载失败'))
      .finally(() => {});
  }, [userId]);

  const fmtDate = (d: string) =>
    d ? new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) : '-';

  return (
    <Dialog title="用户资料" onClose={onClose}>
        {error ? (
          <div className="admin-empty">{error}</div>
        ) : !user ? (
          <div className="admin-loading"><div className="spinner" /></div>
        ) : (
          <>
            {/* 头部：大头像 + 昵称（点击头像可看大图） */}
            <div className="ui-pages-admin-components-userdetaildialog-inline-0">
              <div className="ui-pages-admin-components-userdetaildialog-inline-1">
                <Avatar name={user.nickname} url={user.avatar_url} size={64} />
              </div>
              <h3 className="ui-pages-admin-components-userdetaildialog-inline-2">
                {user.nickname}
                <span className="ui-pages-admin-components-userdetaildialog-inline-3">#{user.id}</span>
              </h3>
              <div className="ui-pages-admin-components-userdetaildialog-inline-4">
                {user.is_admin === 1 && <span className="admin-badge admin-badge--admin">管理员</span>}
                {user.email_verified
                  ? <span className="admin-badge admin-badge--active">邮箱已验证</span>
                  : <span className="admin-badge admin-badge--inactive">邮箱未验证</span>}
              </div>
            </div>

            {/* 基本信息 */}
            <div className="ui-pages-admin-components-userdetaildialog-inline-5">
              {[
                [' 邮箱', user.email || '-'],
                [' QQ邮箱', user.qq_email || '-'],
                [' 学号', user.student_id || '-'],
                [' 学校/校区', [user.school_name, user.campus_name].filter(Boolean).join(' / ') || '-'],
                [' 院系', user.department || '-'],
                [' 注册时间', fmtDate(user.created_at)],
              ].map(([label, value]) => (
                <div key={label} className="ui-pages-admin-components-userdetaildialog-inline-6">
                  <span className="ui-pages-admin-components-userdetaildialog-inline-7">{label}</span>
                  <span className="ui-pages-admin-components-userdetaildialog-inline-8">{value}</span>
                </div>
              ))}
            </div>

            {/* 成长数据 */}
            <div className="ui-pages-admin-components-userdetaildialog-inline-9">
              <div className="admin-section-title">成长数据</div>
              <div className="ui-pages-admin-components-userdetaildialog-inline-10">
                {[
                  ['历史积分', String(user.reward_points)],
                  ['历史等级（旧积分）', `Lv.${user.reward_level}`],
                  [' 连续参与', `${user.reward_streak} 天`],
                  [' 完成局', `${user.completed_games} 场`],
                  [' 发起完成', `${user.hosted_completed_games} 场`],
                  [' 徽章', String(parseList(user.reward_badges).length)],
                ].map(([label, value]) => (
                  <div key={label} className="ui-pages-admin-components-userdetaildialog-inline-11">
                    <div className="ui-pages-admin-components-userdetaildialog-inline-12">{value}</div>
                    <div className="ui-pages-admin-components-userdetaildialog-inline-13">{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 运动偏好 */}
            <div className="ui-pages-admin-components-userdetaildialog-inline-14">
              <div className="admin-section-title">运动偏好</div>
              <div className="admin-chips">
                {parseList(user.sport_preferences).length > 0 ? (
                  parseList(user.sport_preferences).map((s) => (
                    <span key={s}  className={["admin-chip admin-chip--active","ui-pages-admin-components-userdetaildialog-inline-15"].filter(Boolean).join(" ")}>
                      {SPORT_LABELS[s] || s}
                    </span>
                  ))
                ) : (
                  <span className="ui-pages-admin-components-userdetaildialog-inline-16">未设置</span>
                )}
              </div>
            </div>

            <div className="ui-pages-admin-components-userdetaildialog-inline-17">
              <button  className={["btn btn--secondary btn--sm","ui-pages-admin-components-userdetaildialog-inline-18"].filter(Boolean).join(" ")} onClick={onClose}>
                关闭
              </button>
            </div>
          </>
        )}
    </Dialog>
  );
};

export default UserDetailDialog;
