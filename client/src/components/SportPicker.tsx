/**
 * 运动类型选择器 —— 常见运动推荐 + 自定义输入
 */
import React, { useMemo, useState } from 'react';
import type { SportType } from '../types';
import { COMMON_SPORT_TYPES, SPORT_LABELS } from '../types';
import SportIcon from './SportIcon';

/** 始终展示的运动类型 */
const PINNED_SPORTS: SportType[] = ['soccer', 'basketball', 'fitness'];

interface Props {
  value?: SportType;
  onChange: (sport: SportType) => void;
}

const SportPicker: React.FC<Props> = ({ value, onChange }) => {
  const isCommonSport = Boolean(value && COMMON_SPORT_TYPES.includes(value as any));
  const customValue = isCommonSport ? '' : (value || '');
  const [showMore, setShowMore] = useState(false);
  const selectedLabel = value ? (SPORT_LABELS[value] || value) : '未选择';

  const pinnedSports = useMemo(() => {
    return COMMON_SPORT_TYPES.filter((s) => PINNED_SPORTS.includes(s as any));
  }, []);

  const otherSports = useMemo(() => {
    return COMMON_SPORT_TYPES.filter((s) => !PINNED_SPORTS.includes(s as any));
  }, []);

  const renderSportItem = (sport: string) => {
    const isActive = value === sport;
    return (
      <div
        key={sport}
        role="button"
        tabIndex={0}
        aria-pressed={isActive}
        onClick={() => onChange(sport)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onChange(sport);
          }
        }}
        className="ui-components-sportpicker-item" style={{...(isActive ? styles.itemActive : {})}}
      >
        {isActive && <span className="ui-components-sportpicker-selectedBadge">已选</span>}
        <span className="ui-components-sportpicker-iconWrapper" style={{...(isActive ? styles.iconWrapperActive : {})}}>
          <SportIcon sport={sport} size={28} />
        </span>
        <span
          className="ui-components-sportpicker-label" style={{...(isActive ? styles.labelActive : {})}}
        >
          {SPORT_LABELS[sport]}
        </span>
      </div>
    );
  };

  return (
    <div>
      <div className="ui-components-sportpicker-recommendHeader">
        <div className="ui-components-sportpicker-recommendMeta">
          <span className="ui-components-sportpicker-recommendTitle">选择运动类型</span>
          <span className="ui-components-sportpicker-recommendCurrent">当前：{selectedLabel}</span>
        </div>
      </div>

      {/* 始终展示的运动（足球、篮球、健身） */}
      <div className="ui-components-sportpicker-grid">
        {pinnedSports.map(renderSportItem)}
      </div>

      {/* 更多运动 —— 折叠/展开 */}
      <div className="ui-components-sportpicker-moreSection">
        <button
          type="button"
          className="ui-components-sportpicker-moreToggle"
          onClick={() => setShowMore((prev) => !prev)}
        >
          {showMore ? '收起更多' : '展开更多运动'}
          <span className="ui-components-sportpicker-inline-0" style={{transform: showMore ? 'rotate(180deg)' : 'rotate(0deg)'}}>▾</span>
        </button>
        {showMore && (
          <div className={["ui-components-sportpicker-grid","ui-components-sportpicker-inline-1"].filter(Boolean).join(" ")}>
            {otherSports.map(renderSportItem)}
          </div>
        )}
      </div>

      <div className="ui-components-sportpicker-customSection">
        <label className="ui-components-sportpicker-customLabel">或直接输入运动项目</label>
        <input
          className="form-input"
          type="text"
          value={customValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder="例如：飞盘、台球、散步、骑行"
          maxLength={30}
        />
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  recommendHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.875rem',
    padding: '0.85rem 1rem',
    borderRadius: '0.9rem',
    background: '#f3f6f3',
    border: '1px solid #EEF2F7',
  },
  recommendMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  recommendTitle: {
    fontSize: '0.875rem',
    fontWeight: 700,
    color: '#123e29',
  },
  recommendCurrent: {
    fontSize: '0.75rem',
    color: '#64748B',
    fontWeight: 500,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.75rem',
    width: '100%',
  },
  item: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '1rem 0.5rem',
    borderRadius: '0.75rem',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: '#edf2ee',
    background: '#FFFFFF',
    cursor: 'pointer',
    transition: 'all 150ms ease',
    outline: 'none',
    boxShadow: 'none',
  },
  itemActive: {
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: '#123e29',
    background: '#123e29',
    boxShadow: '0 10px 20px rgba(15, 23, 42, 0.12)',
  },
  selectedBadge: {
    position: 'absolute',
    top: '0.55rem',
    right: '0.55rem',
    fontSize: '0.75rem',
    fontWeight: 700,
    color: '#123e29',
    background: '#FFFFFF',
    padding: '0.12rem 0.4rem',
    borderRadius: '9999px',
    lineHeight: 1.4,
  },
  iconWrapper: {
    color: '#64748B',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapperActive: {
    color: '#FFFFFF',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#64748B',
  },
  labelActive: {
    color: '#FFFFFF',
    fontWeight: 700,
  },
  customSection: {
    marginTop: '0.875rem',
  },
  customLabel: {
    display: 'block',
    fontSize: '0.8125rem',
    color: '#6B7280',
    marginBottom: '0.5rem',
  },
  moreSection: {
    marginTop: '0.5rem',
  },
  moreToggle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    padding: '0.6rem 0',
    fontSize: '0.8125rem',
    color: '#6B7280',
    fontWeight: 500,
    background: 'none',
    border: '1px dashed #D1D5DB',
    borderRadius: '0.75rem',
    cursor: 'pointer',
  },
};

export default SportPicker;
