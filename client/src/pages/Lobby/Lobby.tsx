/**
 * 首页运动局大厅 (现代极简风格)
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGames } from '../../hooks/useGames';
import { useAuthStore } from '../../stores/authStore';
import * as authApi from '../../api/auth';
import { showToast } from '../../hooks/useAuth';
import GameCard from './GameCard';
import SportFilter from './SportFilter';
import EmptyState from './EmptyState';
import type { Campus, SportType } from '../../types';

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

  // 页面重新可见时自动刷新列表（从发局页/详情页切回来时）
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refresh]);

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
      <button className="btn btn--primary group-create" onClick={()=>navigate('/create')}>发起运动局</button>
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
          className="ui-pages-lobby-lobby-scopeChip" style={{...(filter.scope !== 'school' ? styles.scopeChipActive : {})}}
          onClick={() => filterByCampus(user?.campus_id, 'campus')}
        >
          本校区
        </button>
        <button
          className="ui-pages-lobby-lobby-scopeChip" style={{...(filter.scope === 'school' ? styles.scopeChipActive : {})}}
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
            className="ui-pages-lobby-lobby-dateQuickBtn" style={{...(filter.date === todayText ? styles.dateQuickBtnActive : {})}}
            onClick={() => filterByDate(todayText)}
          >
            今天
          </button>
          <button
            className="ui-pages-lobby-lobby-dateQuickBtn" style={{...(filter.date === tomorrowText ? styles.dateQuickBtnActive : {})}}
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

      {/* 列表区 */}
      <div className="ui-pages-lobby-lobby-list">
        {loading && games.length === 0 ? (
          <div className="loading-spinner"><div className="spinner" /></div>
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
              <div  className={["loading-spinner","ui-pages-lobby-lobby-inline-0"].filter(Boolean).join(" ")}><div className="spinner" /></div>
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

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1.5rem',
    paddingTop: '0.5rem',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: 900,
    color: '#123e29',
    margin: 0,
    letterSpacing: '-0.03em',
  },
  locationMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    marginTop: '0.25rem',
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#10B981',
  },
  subtitle: {
    fontSize: '0.875rem',
    color: '#64748B',
    fontWeight: 500,
  },
  avatarBtn: {
    width: '2.5rem',
    height: '2.5rem',
    borderRadius: '9999px',
    overflow: 'hidden',
    border: '2px solid #edf2ee',
    padding: 0,
    flexShrink: 0,
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f3f6f3',
    color: '#123e29',
    fontWeight: 700,
    fontSize: '1rem',
  },
  list: {
    padding: '0.5rem 0 2rem 0',
  },
  campusBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.75rem',
  },
  scopeChip: {
    borderRadius: '9999px',
    padding: '0.4rem 1rem',
    background: '#edf2ee',
    color: '#64748B',
    fontSize: '0.8125rem',
    fontWeight: 600,
    border: '1px solid transparent',
    transition: 'all 0.2s',
  },
  scopeChipActive: {
    background: '#123e29',
    color: '#FFFFFF',
    boxShadow: '0 2px 6px rgba(15, 23, 42, 0.15)',
  },
  selectWrapper: {
    flex: 1,
  },
  campusSelect: {
    marginBottom: 0,
    height: '34px',
    padding: '0 2rem 0 1rem',
    borderRadius: '9999px',
    fontSize: '0.8125rem',
    fontWeight: 500,
    border: '1px solid #E2E8F0',
    background: '#FFFFFF',
    color: '#334155',
  },
  endTip: {
    textAlign: 'center',
    color: '#d3ddd5',
    fontSize: '0.75rem',
    padding: '1.5rem 0',
    fontWeight: 500,
  },
  dateFilterBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    background: '#f3f6f3',
    border: '1px solid #E2E8F0',
    borderRadius: '16px',
    padding: '0.75rem 0.875rem',
    marginBottom: '0.85rem',
  },
  dateFilterInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem',
  },
  dateFilterLabel: {
    fontSize: '0.75rem',
    color: '#74817a',
    fontWeight: 700,
  },
  dateFilterValue: {
    fontSize: '0.88rem',
    color: '#123e29',
    fontWeight: 700,
  },
  dateFilterActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexShrink: 0,
  },
  dateInput: {
    position: 'absolute',
    inset: 0,
    marginBottom: 0,
    width: '100%',
    minWidth: 0,
    height: '2.2rem',
    padding: 0,
    borderRadius: '9999px',
    fontSize: '0.8125rem',
    border: 'none',
    background: 'transparent',
    opacity: 0,
    cursor: 'pointer',
  },
  dateInputWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    width: '8.5rem',
    minWidth: '8rem',
    height: '2.2rem',
    padding: '0 0.75rem',
    borderRadius: '9999px',
    border: '1px solid #E2E8F0',
    background: '#FFFFFF',
    overflow: 'hidden',
    cursor: 'pointer',
    appearance: 'none',
  },
  dateInputText: {
    fontSize: '0.8125rem',
    color: '#334155',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  dateInputIcon: {
    fontSize: '0.75rem',
    color: '#74817a',
    fontWeight: 700,
    flexShrink: 0,
  },
  dateQuickBtn: {
    fontSize: '0.75rem',
    color: '#64748B',
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: '9999px',
    padding: '0.42rem 0.72rem',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  dateQuickBtnActive: {
    color: '#FFFFFF',
    background: '#123e29',
    border: '1px solid #123e29',
  },
  dateClearBtn: {
    fontSize: '0.75rem',
    color: '#64748B',
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: '9999px',
    padding: '0.42rem 0.75rem',
    fontWeight: 600,
  },
};

export default Lobby;
