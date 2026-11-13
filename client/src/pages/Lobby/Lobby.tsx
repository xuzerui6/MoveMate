/**
 * 首页运动局大厅 (现代极简风格)
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGames } from '../../hooks/useGames';
import { useAuthStore } from '../../stores/authStore';
import * as authApi from '../../api/auth';
import * as gamesApi from '../../api/games';
import { showToast } from '../../hooks/useAuth';
import GameCard from './GameCard';
import SportFilter from './SportFilter';
import EmptyState from './EmptyState';
import type { Campus, Game, SportType } from '../../types';
import './Lobby.css';

function getDateText(offsetDays = 0): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatFilterDateLabel(date?: string): string {
  if (!date) return '全部日期';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '已选日期';
  return `${parsed.getMonth() + 1}月${parsed.getDate()}日`;
}

const Lobby: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { games, loading, error, hasMore, filter, refresh, loadMore, filterBySport, filterByCampus, filterByDate } = useGames();
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [friendGames, setFriendGames] = useState<Game[]>([]);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const todayText = getDateText(0);
  const tomorrowText = getDateText(1);

  useEffect(() => {
    useAuthStore.getState().init();
  }, []);

  useEffect(() => {
    authApi.fetchBootstrap()
      .then((data) => setCampuses(data.campuses || []))
      .catch(() => setCampuses([]));
  }, []);

  // 好友的局（好友局不进大厅，单独一段给好友看）
  const refreshFriendGames = React.useCallback(() => {
    gamesApi.fetchFriendsFeed().then(setFriendGames).catch(() => setFriendGames([]));
  }, []);
  useEffect(() => { refreshFriendGames(); }, [refreshFriendGames]);

  // 页面重新可见时自动刷新列表（从发局页/详情页切回来时）
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh();
        refreshFriendGames();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refresh, refreshFriendGames]);

  useEffect(() => {
    const scrollArea = document.querySelector('.motion-screen');
    const handleScroll = () => {
      const scrollHeight = scrollArea?.scrollHeight ?? document.documentElement.scrollHeight;
      const scrollTop = scrollArea?.scrollTop ?? window.scrollY;
      const clientHeight = scrollArea?.clientHeight ?? window.innerHeight;
      if (scrollHeight - scrollTop - clientHeight < 200) {
        loadMore();
      }
    };
    const target = scrollArea || window;
    target.addEventListener('scroll', handleScroll, { passive: true });
    return () => target.removeEventListener('scroll', handleScroll);
  }, [loadMore]);

  const openDatePicker = () => {
    const input = dateInputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!input) return;

    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }

    input.focus();
    input.click();
  };

  const handleDateChange = (rawValue?: string) => {
    if (!rawValue) {
      filterByDate(undefined);
      return;
    }

    if (rawValue < todayText) {
      showToast('不能选择过去的日期', 'error');
      filterByDate(undefined);
      return;
    }

    filterByDate(rawValue);
  };

  return (
    <div className="groups-page">
      <div className="group-actions">
        <button className="btn btn--primary group-create" onClick={()=>navigate('/create')}>发起运动局</button>
        <button className="btn btn--secondary group-create" onClick={()=>navigate('/friends')}>我的好友</button>
        <button className="btn btn--secondary group-create" onClick={()=>navigate('/boss-Atlas')}>怪兽图鉴</button>
      </div>
      {/* 极简页面头部 */}
      <div className="ui-pages-lobby-lobby-header">
        <div>
          <h1 className="ui-pages-lobby-lobby-title">一起运动</h1>
          <div className="ui-pages-lobby-lobby-locationMeta">
            <span className="ui-pages-lobby-lobby-dot"></span>
            <span className="ui-pages-lobby-lobby-subtitle">
              {user ? `${user.school_name || '吉林大学'} ${user.campus_name ? `· ${user.campus_name}` : ''}` : '吉林大学学生组局'}
            </span>
          </div>
        </div>
        <button
          className="ui-pages-lobby-lobby-avatarBtn"
          onClick={() => navigate('/profile')}
        >
          {user?.avatar ? (
            <img src={user.avatar} alt="" className="ui-pages-lobby-lobby-avatarImg" />
          ) : (
            <span className="ui-pages-lobby-lobby-avatarPlaceholder">
              {user?.nickname?.charAt(0) || '?'}
            </span>
          )}
        </button>
      </div>

      {/* 极简筛选器 */}
      <div className="ui-pages-lobby-lobby-campusBar">
        <button
          className={"ui-pages-lobby-lobby-scopeChip" + (filter.scope !== 'school' ? " ui-pages-lobby-lobby-scopeChipActive" : "")}
          onClick={() => filterByCampus(user?.campus_id, 'campus')}
        >
          本校区
        </button>
        <button
          className={"ui-pages-lobby-lobby-scopeChip" + (filter.scope === 'school' ? " ui-pages-lobby-lobby-scopeChipActive" : "")}
          onClick={() => filterByCampus(undefined, 'school')}
        >
          全校
        </button>
        <div className="ui-pages-lobby-lobby-selectWrapper">
          <select
            aria-label="筛选校区"
            className="form-select ui-pages-lobby-lobby-campusSelect"
            value={filter.scope === 'school' ? '' : (filter.campus_id || user?.campus_id || '')}
            onChange={(e) => filterByCampus(e.target.value ? Number(e.target.value) : undefined, 'campus')}
            
          >
            <option value="">全部校区</option>
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>{campus.name}</option>
            ))}
          </select>
        </div>
      </div>

      <SportFilter
        value={filter.sport_type as SportType | undefined}
        onChange={filterBySport}
      />

      <div  className="lobby-date-filter ui-pages-lobby-lobby-dateFilterBar">
        <div className="ui-pages-lobby-lobby-dateFilterInfo">
          <span className="ui-pages-lobby-lobby-dateFilterLabel">日期筛选</span>
          <span className="ui-pages-lobby-lobby-dateFilterValue">{formatFilterDateLabel(filter.date)}</span>
        </div>
        <div  className="lobby-date-filter__actions ui-pages-lobby-lobby-dateFilterActions">
          <button
            className={"ui-pages-lobby-lobby-dateQuickBtn" + (filter.date === todayText ? " ui-pages-lobby-lobby-dateQuickBtnActive" : "")}
            onClick={() => filterByDate(todayText)}
          >
            今天
          </button>
          <button
            className={"ui-pages-lobby-lobby-dateQuickBtn" + (filter.date === tomorrowText ? " ui-pages-lobby-lobby-dateQuickBtnActive" : "")}
            onClick={() => filterByDate(tomorrowText)}
          >
            明天
          </button>
          <div
            
            className="lobby-date-input-wrap ui-pages-lobby-lobby-dateInputWrap"
            onClick={openDatePicker}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openDatePicker();
              }
            }}
            role="button"
            tabIndex={0}
          >
            <span className="ui-pages-lobby-lobby-dateInputText">
              {filter.date ? formatFilterDateLabel(filter.date) : '选择日期'}
            </span>
            <span className="ui-pages-lobby-lobby-dateInputIcon">日历</span>
            <input
              ref={dateInputRef}
              type="date"
              className="form-input lobby-date-input ui-pages-lobby-lobby-dateInput"
              value={filter.date || ''}
              onChange={(e) => handleDateChange(e.target.value || undefined)}
              min={todayText}
              
            />
          </div>
          {filter.date && (
            <button className="ui-pages-lobby-lobby-dateClearBtn" onClick={() => filterByDate(undefined)}>
              清除
            </button>
          )}
        </div>
      </div>

      {/* 好友的局：好友局不挂大厅，只在这一段里给好友看 */}
      {friendGames.length > 0 && (
        <div className="ui-pages-lobby-lobby-list lobby-friend-games">
          <h2 className="lobby-friend-games-title">好友的局</h2>
          <p className="lobby-friend-games-note">这些局只给好友看，点开就能加入。</p>
          {friendGames.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}

      {/* 列表区 */}
      <div className="ui-pages-lobby-lobby-list">
        {loading && games.length === 0 ? (
          <div className="motion-loading" role="status">正在读取…</div>
        ) : error && games.length === 0 ? (
          <EmptyState error={error||'暂时无法连接，请重试'} onAction={() => refresh()} />
        ) : games.length === 0 ? (
          <EmptyState onAction={() => navigate('/create')} />
        ) : (
          <>
            {games.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
            {loading && (
              <div className={["motion-loading","ui-pages-lobby-lobby-inline-0"].filter(Boolean).join(" ")} role="status">正在加载更多…</div>
            )}
            {hasMore&&!loading&&<button className="btn btn--secondary" onClick={loadMore}>加载更多活动</button>}
            {!loading && !hasMore && games.length > 0 && (
              <p className="ui-pages-lobby-lobby-endTip">已展示全部</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Lobby;
