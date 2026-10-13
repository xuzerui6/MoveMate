/**
 * 个人中心页 (现代极简版)
 * 弱化资料，突出“我的局”
 */
import {Link} from 'react-router-dom';
import {Icon} from '../../features/motion/components/Icons';
import {AvatarFigure} from '../../features/motion/components/AvatarFigure';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useStore } from '../../features/motion/lib/store';
import { useAuth, showToast } from '../../hooks/useAuth';
import * as authApi from '../../api/auth';
import * as gamesApi from '../../api/games';
import { getErrorMessage } from '../../api/client';
import { COMMON_SPORT_TYPES, SPORT_LABELS } from '../../types';
import type { Game, Campus } from '../../types';
import GameCard from '../Lobby/GameCard';
import SportIcon from '../../components/SportIcon';
import Avatar from '../../components/Avatar';

function getColor(name: string): string {
  const colors = ['#123e29', '#334155', '#475569', '#1E293B'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getLevelTitle(level: number): string {
  if (level >= 6) return '王牌组局者';
  if (level >= 5) return '活跃领队';
  if (level >= 4) return '热血玩家';
  if (level >= 3) return '运动熟人';
  if (level >= 2) return '校园活跃者';
  return '新手球友';
}

const Profile: React.FC = () => {
  const {state:motion,loaded:motionLoaded}=useStore();
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const verifyEmail = useAuthStore((s) => s.verifyEmail);
  const [emailCode, setEmailCode] = useState('');
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const { logout } = useAuth();

  // 我参与的运动局
  const [myGames, setMyGames] = useState<Game[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ gameId: number; type: 'delete' | 'leave' | 'cancel' } | null>(null);
  const restoreScrollRef = useRef<number | null>(null);

  // 折叠状态
  const [showProfileInfo, setShowProfileInfo] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profileForm, setProfileForm] = useState({
    nickname: '',
    department: '',
    avatar: '',
    qq_email: '',
    campus_id: 0,
    sport_preferences: [] as string[],
    custom_sport: '',
  });
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [sportPrefsDirty, setSportPrefsDirty] = useState(false);
  const [savedSportPrefs, setSavedSportPrefs] = useState<string[]>([]);

  const [gamesError,setGamesError]=useState('');
  const loadMyGames = useCallback(async () => {
    setGamesLoading(true);
    try {
      const res = await gamesApi.fetchMyGames() as any;
      const body = res.data || res;
      setGamesError('');setMyGames(Array.isArray(body) ? body : (body.games || []));
    } catch (e) {setGamesError(getErrorMessage(e));}
 finally {
      setGamesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadMyGames();
    }
  }, [user, loadMyGames]);

  useEffect(() => {
    if (!user) return;
    const prefs = user.sport_preferences || [];
    setProfileForm({
      nickname: user.nickname || '',
      department: user.department || '',
      avatar: user.avatar || '',
      qq_email: user.qq_email || '',
      campus_id: user.campus_id || 0,
      sport_preferences: prefs,
      custom_sport: '',
    });
    setSavedSportPrefs([...prefs]);
    setSportPrefsDirty(false);
  }, [user]);

  // 加载校区列表
  useEffect(() => {
    authApi.fetchBootstrap().then(b => setCampuses(b.campuses || [])).catch(() => {});
  }, []);

  const handleGameAction = async (game: Game, e: React.MouseEvent) => {
    e.stopPropagation();
    restoreScrollRef.current = window.scrollY;
    try {
      if (game.status === 'completed' || game.status === 'archived' || game.status === 'cancelled') {
        await gamesApi.removeMyGame(String(game.id));
        setMyGames((prev) => prev.filter((item) => item.id !== game.id));
        setPendingAction(null);
        showToast('已从我的局删除', 'success');
      } else if (game.is_host) {
        await gamesApi.cancelGame(String(game.id));
        setMyGames((prev) =>
          prev.map((item) =>
            item.id === game.id ? { ...item, status: 'cancelled' } : item
          )
        );
        setPendingAction(null);
        showToast('已取消', 'success');
      } else {
        await gamesApi.leaveGame(String(game.id));
        setMyGames((prev) => prev.filter((item) => item.id !== game.id));
        setPendingAction(null);
        showToast('已退出', 'success');
      }
      requestAnimationFrame(() => {
        const scrollTop = restoreScrollRef.current;
        if (scrollTop != null) {
          window.scrollTo({ top: scrollTop });
          restoreScrollRef.current = null;
        }
      });
    } catch (err) {
      restoreScrollRef.current = null;
      showToast(getErrorMessage(err), 'error');
    }
  };

  const handleStartEdit = () => {
    setShowProfileInfo(true);
    setEditingProfile(true);
  };

  const handleCancelEdit = () => {
    if (!user) return;
    setProfileForm({
      nickname: user.nickname || '',
      department: user.department || '',
      avatar: user.avatar || '',
      qq_email: user.qq_email || '',
      campus_id: user.campus_id || 0,
      sport_preferences: user.sport_preferences || [],
      custom_sport: '',
    });
    setEditingProfile(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/v1/users/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
        body: formData,
      });
      const result = await response.json();
      if (result.code === 0 && result.data?.url) {
        const url = result.data.url;
        setProfileForm((prev) => ({ ...prev, avatar: url }));
        // 后端已在 POST /avatar 中写入 DB，这里直接同步 store 和 localStorage
        const cur = useAuthStore.getState().user;
        if (cur) {
          useAuthStore.getState().setSession({ ...cur, avatar: url });
        }
        showToast('头像已上传', 'success');
      } else {
        showToast(result.message || '上传失败', 'error');
      }
    } catch {
      showToast('上传失败', 'error');
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveSportPrefs = async () => {
    try {
      setProfileSaving(true);
      await updateProfile({ sport_preferences: profileForm.sport_preferences });
      setSavedSportPrefs([...profileForm.sport_preferences]);
      setSportPrefsDirty(false);
      showToast('运动偏好已保存', 'success');
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAddCustomSport = () => {
    const name = profileForm.custom_sport.trim();
    if (!name) return;
    if (profileForm.sport_preferences.includes(name)) {
      showToast('该运动已存在', 'info');
      return;
    }
    setProfileForm((prev) => ({
      ...prev,
      sport_preferences: [...prev.sport_preferences, name],
      custom_sport: '',
    }));
    setSportPrefsDirty(true);
  };

  const handleSaveProfile = async () => {
    const nickname = profileForm.nickname.trim();
    const department = profileForm.department.trim();
    const avatar = profileForm.avatar.trim();
    const qq_email = profileForm.qq_email.trim();

    if (!nickname) {
      showToast('昵称不能为空', 'error');
      return;
    }
    if (qq_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(qq_email)) {
      showToast('QQ邮箱格式不正确', 'error');
      return;
    }

    try {
      setProfileSaving(true);
      await updateProfile({
        nickname,
        department,
        avatar,
        qq_email: qq_email || undefined,
        campus_id: profileForm.campus_id || undefined,
        sport_preferences: profileForm.sport_preferences,
      });
      showToast('资料已更新', 'success');
      setEditingProfile(false);
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  if (!user) return null;

  const displayNickname = editingProfile ? (profileForm.nickname || user.nickname) : user.nickname;
  const displayAvatar = editingProfile ? (profileForm.avatar || user.avatar) : user.avatar;

  return (
    <div className="profile-page">
      <div className="motion-growth">{motionLoaded?<><div className="profile-level"><b>Lv.{motion.level}</b><div><p>当前经验 <strong>{motion.xp} / {300+(motion.level-1)*100} XP</strong></p><div className="progress"><i style={{width:Math.min(100,motion.xp/(300+(motion.level-1)*100)*100)+'%'}}/></div></div></div><div className="profile-growth-stats"><div><strong>{motion.totalXp}</strong><small>累计 XP</small></div><div><strong>{motion.completedWorkoutCount}</strong><small>有效训练</small></div><div><strong>{motion.streakDays}</strong><small>连续运动天数</small></div></div></>:<p>正在读取成长数据…</p>}</div>
      <div className="motion-shortcuts"><Link to="/avatar"><Icon name="user"/>我的形象</Link><Link to="/inventory"><Icon name="bag"/>装备背包</Link><Link to="/history"><Icon name="clock"/>训练历史</Link><a href="#my-games"><Icon name="calendar"/>活动记录</a><Link to="/leaderboard"><Icon name="trophy"/>成长榜单</Link><Link to="/feedback"><Icon name="spark"/>意见反馈</Link></div>
      <div className="ui-pages-profile-profile-header">
        <h1 className="ui-pages-profile-profile-title">我的</h1>
        <div className="ui-pages-profile-profile-headerActions">
          <button
            className="ui-pages-profile-profile-feedbackBtn"
            onClick={() => window.location.href = '/feedback'}
          >
            反馈
          </button>
          {user.is_admin && (
            <button
              className="ui-pages-profile-profile-adminBtn"
              onClick={() => window.location.href = '/admin'}
            >
              管理
            </button>
          )}
          <button className="ui-pages-profile-profile-logoutBtn" onClick={logout}>退出</button>
        </div>
      </div>

      {/* 用户基本信息 (紧凑版) */}
      <div className="ui-pages-profile-profile-userSummaryCard">
        <div className="ui-pages-profile-profile-avatarRow">
          {displayAvatar || !motionLoaded ? <Avatar name={displayNickname} url={displayAvatar} size={80} /> : <div className="profile-pixel-avatar"><AvatarFigure size="small"/></div>}
          <div className="ui-pages-profile-profile-userInfo">
            <h2 className="ui-pages-profile-profile-nickname">{displayNickname}</h2>
            <div className="ui-pages-profile-profile-metaRow">
              <span className="ui-pages-profile-profile-schoolTag">{user.campus_name} · {user.school_name || '吉林大学'}</span>
              {user.campus_verified && <span className="ui-pages-profile-profile-verifiedTag">邮箱已认证</span>}
            </div>
          </div>

          <div className="ui-pages-profile-profile-profileActions">
            <button className="ui-pages-profile-profile-expandBtn" onClick={() => setShowProfileInfo(!showProfileInfo)}>
              {showProfileInfo ? '收起资料' : '查看资料'}
            </button>
            <button className="ui-pages-profile-profile-editBtn" onClick={editingProfile ? handleCancelEdit : handleStartEdit}>
              <Icon name={editingProfile?'close':'pencil'}/><span className="sr-only">{editingProfile ? '取消编辑' : '编辑资料'}</span>
            </button>
          </div>
        </div>
        <p className="profile-motto">每次运动，都在成为更好的自己。</p>

        {!user.campus_verified && (
          <div className="form-group">
            <p>验证校园邮箱后即可发局、加局。</p>
            <button className="btn btn--outline" disabled={verifyingEmail} onClick={async () => {
              setVerifyingEmail(true);
              try { await authApi.sendVerifyCode(user.email); showToast('验证码已发送', 'success'); }
              catch (error) { showToast(getErrorMessage(error), 'error'); }
              finally { setVerifyingEmail(false); }
            }}>发送验证码</button>
            <input className="form-input" aria-label="校园邮箱验证码" placeholder="6位验证码" value={emailCode} maxLength={6} onChange={(event) => setEmailCode(event.target.value)} />
            <button className="btn btn--primary" disabled={verifyingEmail || !/^\d{6}$/.test(emailCode)} onClick={async () => {
              setVerifyingEmail(true);
              try { await verifyEmail(emailCode); setEmailCode(''); showToast('邮箱验证成功', 'success'); }
              catch (error) { showToast(getErrorMessage(error), 'error'); }
              finally { setVerifyingEmail(false); }
            }}>验证校园邮箱</button>
          </div>
        )}
        

        {/* 展开的个人资料 */}
        {showProfileInfo && (
          <div className="ui-pages-profile-profile-profileDetails">
            {editingProfile ? (
              <>
                <div className="ui-pages-profile-profile-formGroup">
                  <span className="ui-pages-profile-profile-infoLabel">昵称</span>
                  <input
                    className="form-input"
                    value={profileForm.nickname}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, nickname: e.target.value }))}
                    aria-label="昵称" placeholder="输入你的昵称"
                    maxLength={20}
                  />
                </div>
                <div className="ui-pages-profile-profile-formGroup">
                  <span className="ui-pages-profile-profile-infoLabel">院系</span>
                  <input
                    className="form-input"
                    value={profileForm.department}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, department: e.target.value }))}
                    aria-label="院系" placeholder="例如：计算机学院"
                    maxLength={100}
                  />
                </div>
                <div className="ui-pages-profile-profile-formGroup">
                  <span className="ui-pages-profile-profile-infoLabel">头像</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="ui-pages-profile-profile-inline-0"
                  />
                  <div className="ui-pages-profile-profile-avatarUploadRow">
                    <div className={["ui-pages-profile-profile-avatar","ui-pages-profile-profile-inline-1"].filter(Boolean).join(" ")} style={{backgroundColor: getColor(displayNickname)}}>
                      {profileForm.avatar ? <img src={profileForm.avatar} alt="" className="ui-pages-profile-profile-avatarImg" /> : displayNickname.charAt(0)}
                    </div>
                    <button
                      type="button"
                      className="ui-pages-profile-profile-avatarChooseBtn"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={avatarUploading}
                    >
                      {avatarUploading ? '上传中...' : (profileForm.avatar ? '更换头像' : '拍照或选图')}
                    </button>
                    {profileForm.avatar && (
                      <button
                        type="button"
                        className="ui-pages-profile-profile-avatarRemoveBtn"
                        onClick={() => setProfileForm((prev) => ({ ...prev, avatar: '' }))}
                      >
                        移除
                      </button>
                    )}
                  </div>
                </div>
                <div className="ui-pages-profile-profile-formGroup">
                  <span className="ui-pages-profile-profile-infoLabel">运动偏好</span>
                  <div className="ui-pages-profile-profile-sportTagRow">
                    {COMMON_SPORT_TYPES.map((sport) => {
                      const selected = profileForm.sport_preferences.includes(sport);
                      return (
                        <div
                          key={sport}
                          role="button"
                          aria-pressed={selected}
                          tabIndex={0}
                          className="ui-pages-profile-profile-sportTag" style={{...(selected ? styles.sportTagActive : {})}}
                          onClick={() => {
                            setProfileForm((prev) => ({
                              ...prev,
                              sport_preferences: selected
                                ? prev.sport_preferences.filter((s) => s !== sport)
                                : [...prev.sport_preferences, sport],
                            }));
                            setSportPrefsDirty(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setProfileForm((prev) => ({
                                ...prev,
                                sport_preferences: selected
                                  ? prev.sport_preferences.filter((s) => s !== sport)
                                  : [...prev.sport_preferences, sport],
                              }));
                              setSportPrefsDirty(true);
                            }
                          }}
                        >
                          <SportIcon sport={sport} size={14} />
                          {SPORT_LABELS[sport]}
                        </div>
                      );
                    })}
                    {/* 已选的自定义运动（不在 COMMON_SPORT_TYPES 中的） */}
                    {profileForm.sport_preferences.filter((s) => !COMMON_SPORT_TYPES.includes(s as any)).map((s) => (
                      <div
                        key={s}
                        role="button"
                        tabIndex={0}
                        className={["ui-pages-profile-profile-sportTag","ui-pages-profile-profile-sportTagActive"].filter(Boolean).join(" ")}
                        onClick={() => {
                          setProfileForm((prev) => ({
                            ...prev,
                            sport_preferences: prev.sport_preferences.filter((x) => x !== s),
                          }));
                          setSportPrefsDirty(true);
                        }}
                      >
                        {SPORT_LABELS[s] || s}
                      </div>
                    ))}
                  </div>
                  {/* 自定义运动输入 */}
                  <div className="ui-pages-profile-profile-customSportRow">
                    <input
                      
                      className={["form-input","ui-pages-profile-profile-inline-2"].filter(Boolean).join(" ")}
                      value={profileForm.custom_sport}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, custom_sport: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomSport(); } }}
                      aria-label="其他运动" placeholder="输入其他运动名称"
                      maxLength={20}
                    />
                    <button type="button" className="ui-pages-profile-profile-addSportBtn" onClick={handleAddCustomSport}>
                      添加
                    </button>
                  </div>
                  {/* 运动偏好保存按钮 */}
                  {sportPrefsDirty && (
                    <button
                      type="button"
                      className="ui-pages-profile-profile-saveSportPrefsBtn"
                      onClick={handleSaveSportPrefs}
                      disabled={profileSaving}
                    >
                      {profileSaving ? '保存中...' : '保存运动偏好'}
                    </button>
                  )}
                </div>
                <div className="ui-pages-profile-profile-formGroup">
                  <span className="ui-pages-profile-profile-infoLabel">校区</span>
                  <select
                    className="form-input"
                    value={profileForm.campus_id || ''}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, campus_id: parseInt(e.target.value) || 0 }))}
                  >
                    <option value="">请选择校区</option>
                    {campuses.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="ui-pages-profile-profile-infoItem">
                  <span className="ui-pages-profile-profile-infoLabel">学生邮箱</span>
                  <span className={["ui-pages-profile-profile-infoValue","ui-pages-profile-profile-inline-3"].filter(Boolean).join(" ")}>{user.email}</span>
                </div>
                <div className="ui-pages-profile-profile-formGroup">
                  <span className="ui-pages-profile-profile-infoLabel">QQ邮箱（通知用）</span>
                  <input
                    className="form-input"
                    type="email"
                    value={profileForm.qq_email}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, qq_email: e.target.value }))}
                    aria-label="QQ邮箱" placeholder="选填，用于接收活动通知"
                  />
                </div>
                <div className="ui-pages-profile-profile-editFooter">
                  <button className="ui-pages-profile-profile-secondaryBtn" onClick={handleCancelEdit}>
                    取消
                  </button>
                  <button className="ui-pages-profile-profile-primaryBtn" onClick={handleSaveProfile} disabled={profileSaving}>
                    {profileSaving ? '保存中...' : '保存资料'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="ui-pages-profile-profile-infoItem">
                  <span className="ui-pages-profile-profile-infoLabel">院系</span>
                  <span className="ui-pages-profile-profile-infoValue">{user.department || '未填写'}</span>
                </div>
                <div className="ui-pages-profile-profile-infoItem">
                  <span className="ui-pages-profile-profile-infoLabel">校区</span>
                  <span className="ui-pages-profile-profile-infoValue">{user.campus_name || user.campus || '未设置'}</span>
                </div>
                <div className="ui-pages-profile-profile-infoItem">
                  <span className="ui-pages-profile-profile-infoLabel">学生邮箱</span>
                  <span className="ui-pages-profile-profile-infoValue">{user.email}</span>
                </div>
                <div className="ui-pages-profile-profile-infoItem">
                  <span className="ui-pages-profile-profile-infoLabel">QQ邮箱</span>
                  <span className="ui-pages-profile-profile-infoValue">{user.qq_email || '未填写'}</span>
                </div>
                <div className="ui-pages-profile-profile-infoItem">
                  <span className="ui-pages-profile-profile-infoLabel">运动偏好</span>
                  <span className="ui-pages-profile-profile-infoValue">
                    {user.sport_preferences?.length
                      ? user.sport_preferences.map((s) => (
                          <span key={s} className="ui-pages-profile-profile-sportTagDisplay">
                            <SportIcon sport={s} size={14} />
                            {SPORT_LABELS[s] || s}
                          </span>
                        ))
                      : '未设置'}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 我的局列表 */}
      <div className="ui-pages-profile-profile-section">
        <div className="profile-preferences"><div className="section-title"><h3>我的运动偏好</h3><button onClick={handleStartEdit}>编辑偏好</button></div><div className="profile-preference-list">{(user.sport_preferences||[]).length?(user.sport_preferences||[]).map(sport=><span key={sport}>{SPORT_LABELS[sport]||sport}</span>):<p>还未设置运动偏好</p>}</div></div>
        <h3 className="ui-pages-profile-profile-sectionTitle" id="my-games">我参与的活动</h3>
        {gamesError&&<div className="inline-error" role="alert"><p>{gamesError}</p><button className="btn btn--secondary" onClick={()=>void loadMyGames()}>重新加载活动</button></div>}
        {gamesLoading && myGames.length === 0 ? (
          <div className="loading-spinner"><div className="spinner" /></div>
        ) : myGames.length === 0 ? (
          <div  className={["empty-state","ui-pages-profile-profile-inline-4"].filter(Boolean).join(" ")}>
            <div className="empty-state__icon"><Icon name="users" size={42}/></div>
            <h3 className="empty-state__title">暂无活动</h3>
            <p className="empty-state__desc">去探索一下有没有感兴趣的局吧</p>
          </div>
        ) : (
          <div className="ui-pages-profile-profile-gamesList">
            {myGames.map((game) => (
              <div key={game.id} className="ui-pages-profile-profile-gameWrapper">
                <GameCard 
                  game={game} 
                  hideActionBtn={true} 
                  customActionBtn={
                    (game.status === 'completed' || game.status === 'archived' || game.status === 'cancelled') ? (
                      pendingAction?.gameId === game.id && pendingAction.type === 'delete' ? (
                        <div
                          className="ui-pages-profile-profile-confirmGroup"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="ui-pages-profile-profile-confirmDeleteBtn"
                            onClick={(e) => handleGameAction(game, e)}
                          >
                            确认删除
                          </button>
                          <button
                            className="ui-pages-profile-profile-cancelDeleteBtn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingAction(null);
                            }}
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          className="ui-pages-profile-profile-deleteBtn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingAction({ gameId: game.id, type: 'delete' });
                          }}
                        >
                          删除记录
                        </button>
                      )
                    ) : (game.status === 'recruiting' || game.status === 'ready' || game.status === 'full') ? (
                      pendingAction?.gameId === game.id &&
                      pendingAction.type === (game.is_host ? 'cancel' : 'leave') ? (
                        <div
                          className="ui-pages-profile-profile-confirmGroup"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            style={game.is_host ? styles.confirmCancelBtn : styles.confirmLeaveBtn}
                            onClick={(e) => handleGameAction(game, e)}
                          >
                            {game.is_host ? '确认取消' : '确认退出'}
                          </button>
                          <button
                            className="ui-pages-profile-profile-cancelDeleteBtn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingAction(null);
                            }}
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button 
                          style={game.is_host ? styles.cancelBtn : styles.leaveBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingAction({ gameId: game.id, type: game.is_host ? 'cancel' : 'leave' });
                          }}
                        >
                          {game.is_host ? '取消组局' : '退出此局'}
                        </button>
                      )
                    ) : undefined
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>
      <details className="legacy-rewards"><summary>历史积分与出勤记录</summary><div className="ui-pages-profile-profile-rewardPanel">
          <div className="ui-pages-profile-profile-rewardCardPrimary">
            <span className="ui-pages-profile-profile-rewardLabel">历史等级（旧积分）</span>
            <div className="ui-pages-profile-profile-rewardPrimaryRow">
              <strong className="ui-pages-profile-profile-rewardPrimaryValue">Lv.{user.reward_level || 1}</strong>
              <span className="ui-pages-profile-profile-rewardPrimaryMeta">{getLevelTitle(user.reward_level || 1)}</span>
            </div>
          </div>
          <div className="ui-pages-profile-profile-rewardGrid">
            <div className="ui-pages-profile-profile-rewardStat">
              <span className="ui-pages-profile-profile-rewardLabel">历史积分</span>
              <strong className="ui-pages-profile-profile-rewardValue">{user.reward_points || 0}</strong>
            </div>
            <div className="ui-pages-profile-profile-rewardStat">
              <span className="ui-pages-profile-profile-rewardLabel">连续参与</span>
              <strong className="ui-pages-profile-profile-rewardValue">{user.reward_streak || 0}天</strong>
            </div>
            <div className="ui-pages-profile-profile-rewardStat">
              <span className="ui-pages-profile-profile-rewardLabel">完成活动</span>
              <strong className="ui-pages-profile-profile-rewardValue">{user.completed_games || 0}</strong>
            </div>
            <div className="ui-pages-profile-profile-rewardStat">
              <span className="ui-pages-profile-profile-rewardLabel">成局次数</span>
              <strong className="ui-pages-profile-profile-rewardValue">{user.hosted_completed_games || 0}</strong>
            </div>
          </div>
          {!!user.reward_badges?.length && (
            <div className="ui-pages-profile-profile-badgeRow">
              {user.reward_badges.map((badge) => (
                <span key={badge} className="ui-pages-profile-profile-badgeChip">{badge}</span>
              ))}
            </div>
          )}
        </div></details>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
    padding: '0.5rem 0',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: 900,
    color: '#123e29',
    letterSpacing: '-0.03em',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  feedbackBtn: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#64748B',
    background: '#edf2ee',
    border: '1px solid #E2E8F0',
    padding: '0.3rem 0.7rem',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  adminBtn: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#FFFFFF',
    background: '#123e29',
    border: '1px solid #123e29',
    padding: '0.3rem 0.7rem',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  logoutBtn: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#64748B',
    background: '#edf2ee',
    padding: '0.4rem 1rem',
    borderRadius: '9999px',
  },
  userSummaryCard: {
    background: '#FFFFFF',
    borderRadius: '16px',
    padding: '1.25rem',
    marginBottom: '1.5rem',
    border: '1px solid #edf2ee',
  },
  avatarRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  avatar: {
    width: '3.5rem',
    height: '3.5rem',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: 700,
    fontSize: '1.25rem',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  userInfo: {
    flex: 1,
  },
  nickname: {
    fontSize: '1.25rem',
    fontWeight: 800,
    color: '#123e29',
    marginBottom: '0.25rem',
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  schoolTag: {
    fontSize: '0.75rem',
    color: '#64748B',
    fontWeight: 500,
  },
  verifiedTag: {
    fontSize: '0.75rem',
    color: '#10B981',
    background: '#ECFDF5',
    padding: '2px 6px',
    borderRadius: '4px',
    fontWeight: 700,
  },
  expandBtn: {
    fontSize: '0.8125rem',
    color: '#008a49',
    fontWeight: 600,
  },
  editBtn: {
    fontSize: '0.8125rem',
    color: '#123e29',
    fontWeight: 600,
    background: '#f3f6f3',
    padding: '0.35rem 0.8rem',
    borderRadius: '9999px',
  },
  profileActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  profileDetails: {
    marginTop: '1.25rem',
    paddingTop: '1rem',
    borderTop: '1px solid #edf2ee',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  rewardPanel: {
    marginTop: '1rem',
    paddingTop: '1rem',
    borderTop: '1px solid #edf2ee',
  },
  rewardCardPrimary: {
    padding: '0.95rem 1rem',
    borderRadius: '14px',
    background: '#123e29',
    color: '#FFFFFF',
    marginBottom: '0.85rem',
  },
  rewardPrimaryRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.6rem',
    marginTop: '0.35rem',
  },
  rewardPrimaryValue: {
    fontSize: '1.4rem',
    fontWeight: 900,
  },
  rewardPrimaryMeta: {
    fontSize: '0.8125rem',
    color: 'rgba(255,255,255,0.76)',
    fontWeight: 600,
  },
  rewardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '0.75rem',
  },
  rewardStat: {
    background: '#f3f6f3',
    borderRadius: '12px',
    padding: '0.8rem 0.9rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  rewardLabel: {
    fontSize: '0.75rem',
    color: '#74817a',
    fontWeight: 600,
  },
  rewardValue: {
    fontSize: '1rem',
    color: '#123e29',
    fontWeight: 800,
  },
  badgeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    marginTop: '0.85rem',
  },
  badgeChip: {
    fontSize: '0.75rem',
    color: '#1D4ED8',
    background: '#edf8f0',
    padding: '0.35rem 0.65rem',
    borderRadius: '9999px',
    fontWeight: 700,
  },
  infoItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: '0.8125rem',
    color: '#74817a',
    fontWeight: 500,
  },
  infoValue: {
    fontSize: '0.875rem',
    color: '#334155',
    fontWeight: 600,
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  editFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
    marginTop: '0.5rem',
  },
  secondaryBtn: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#64748B',
    background: '#edf2ee',
    padding: '0.55rem 1rem',
    borderRadius: '9999px',
  },
  primaryBtn: {
    fontSize: '0.875rem',
    fontWeight: 700,
    color: '#FFFFFF',
    background: '#123e29',
    padding: '0.55rem 1rem',
    borderRadius: '9999px',
  },
  section: {
    marginBottom: '2rem',
  },
  sectionTitle: {
    fontSize: '1.125rem',
    fontWeight: 800,
    color: '#123e29',
    marginBottom: '1rem',
  },
  gamesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  gameWrapper: {
    position: 'relative',
  },
  leaveBtn: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#64748B',
    background: '#edf2ee',
    padding: '0.35rem 1rem',
    borderRadius: '9999px',
  },
  cancelBtn: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#EF4444',
    background: '#FEF2F2',
    padding: '0.35rem 1rem',
    borderRadius: '9999px',
  },
  confirmLeaveBtn: {
    fontSize: '0.75rem',
    fontWeight: 700,
    color: '#FFFFFF',
    background: '#123e29',
    padding: '0.35rem 0.8rem',
    borderRadius: '9999px',
  },
  confirmCancelBtn: {
    fontSize: '0.75rem',
    fontWeight: 700,
    color: '#FFFFFF',
    background: '#EF4444',
    padding: '0.35rem 0.8rem',
    borderRadius: '9999px',
  },
  deleteBtn: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#475569',
    background: '#f3f6f3',
    padding: '0.35rem 1rem',
    borderRadius: '9999px',
    border: '1px solid #E2E8F0',
  },
  confirmGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
  },
  confirmDeleteBtn: {
    fontSize: '0.75rem',
    fontWeight: 700,
    color: '#FFFFFF',
    background: '#EF4444',
    padding: '0.35rem 0.8rem',
    borderRadius: '9999px',
  },
  cancelDeleteBtn: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#64748B',
    background: '#f3f6f3',
    padding: '0.35rem 0.8rem',
    borderRadius: '9999px',
    border: '1px solid #E2E8F0',
  },
  sportTagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.4rem',
  },
  sportTag: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.3rem 0.6rem',
    borderRadius: '8px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#E2E8F0',
    background: '#f3f6f3',
    color: '#64748B',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
    outline: 'none',
    boxShadow: 'none',
  },
  sportTagActive: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#123e29',
    background: '#123e29',
    color: '#FFFFFF',
    outline: 'none',
    boxShadow: 'none',
  },
  sportTagDisplay: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    marginLeft: '0.25rem',
    padding: '0.15rem 0.45rem',
    borderRadius: '6px',
    background: '#edf2ee',
    color: '#334155',
    fontSize: '0.75rem',
    fontWeight: 600,
  },
  avatarUploadRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  avatarChooseBtn: {
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: '#008a49',
    background: '#edf8f0',
    padding: '0.45rem 0.9rem',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
  },
  avatarRemoveBtn: {
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: '#EF4444',
    background: '#FEF2F2',
    padding: '0.45rem 0.9rem',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
  },
  customSportRow: {
    display: 'flex',
    gap: '0.4rem',
    marginTop: '0.5rem',
  },
  addSportBtn: {
    fontSize: '0.8125rem',
    fontWeight: 700,
    color: '#FFFFFF',
    background: '#123e29',
    padding: '0.4rem 0.85rem',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
  },
  saveSportPrefsBtn: {
    width: '100%',
    marginTop: '0.6rem',
    fontSize: '0.875rem',
    fontWeight: 700,
    color: '#FFFFFF',
    background: '#10B981',
    padding: '0.55rem 0',
    borderRadius: '10px',
    border: 'none',
    cursor: 'pointer',
  },
};

export default Profile;
