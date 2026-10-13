import {Icon} from '../../features/motion/components/Icons';
/**
 * 运动类型筛选栏 —— 横向滚动的 chip 列表
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { SportType } from '../../types';
import { COMMON_SPORT_TYPES, SPORT_LABELS } from '../../types';
import SportIcon from '../../components/SportIcon';

interface Props {
  value?: SportType;
  onChange: (sport?: SportType) => void;
}

const SportFilter: React.FC<Props> = ({ value, onChange }) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [showFade, setShowFade] = useState(false);
  const [scrollInfo, setScrollInfo] = useState({ thumbLeft: 0, thumbWidth: 100 });
  const [showTrack, setShowTrack] = useState(false);

  const updateGuideState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const canScroll = el.scrollWidth - el.clientWidth > 12;
    const nearEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 12;
    setShowGuide(canScroll && el.scrollLeft < 16);
    setShowFade(canScroll && !nearEnd);
    setShowTrack(canScroll);

    // 计算滑槽指示器位置
    if (canScroll) {
      const trackWidth = el.clientWidth;
      const contentWidth = el.scrollWidth;
      const thumbWidth = Math.max((trackWidth / contentWidth) * trackWidth, 28);
      const maxLeft = trackWidth - thumbWidth;
      const scrollRatio = el.scrollLeft / (contentWidth - el.clientWidth);
      setScrollInfo({
        thumbLeft: Math.min(maxLeft * scrollRatio, maxLeft),
        thumbWidth,
      });
    } else {
      setScrollInfo({ thumbLeft: 0, thumbWidth: 100 });
    }
  }, []);

  useEffect(() => {
    updateGuideState();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateGuideState, { passive: true });
    window.addEventListener('resize', updateGuideState);
    return () => {
      el.removeEventListener('scroll', updateGuideState);
      window.removeEventListener('resize', updateGuideState);
    };
  }, [updateGuideState]);

  return (
    <div className="sport-filter-shell">
      <div className="sport-filter-head">
        <span className="sport-filter-hint">
          {showGuide ? '左右滑动查看更多运动' : '按运动类型筛选'}
        </span>
      </div>
      <div className="sport-filter-wrap">
        <div ref={scrollRef} className="filter-bar">
          <button
            className={`filter-chip ${!value ? 'filter-chip--active' : ''}`}
            onClick={() => onChange(undefined)}
          >
            全部
          </button>

          {COMMON_SPORT_TYPES.map((sport) => {
            const isActive = value === sport;
            return (
              <button
                key={sport}
                
                onClick={() => onChange(isActive ? undefined : sport)}
                className={[`filter-chip ${isActive ? 'filter-chip--active' : ''}`,"ui-pages-lobby-sportfilter-inline-0"].filter(Boolean).join(" ")}
              >
                <SportIcon sport={sport} size={16} />
                {SPORT_LABELS[sport]}
              </button>
            );
          })}
        </div>
        {showFade && <div className="filter-bar-fade" aria-hidden="true" />}
      </div>
      {/* 下滑槽指示器 */}
      <div className={`sport-filter-track-row ${showTrack ? '' : 'sport-filter-track--hidden'}`}>
        <span className="sport-filter-track-arrow"><Icon name="back" size={14}/></span>
        <div className="sport-filter-track">
          <div
            className="sport-filter-thumb"
            style={{
              left: `${scrollInfo.thumbLeft}px`,
              width: `${scrollInfo.thumbWidth}px`,
            }}
          />
        </div>
        <span className="sport-filter-track-arrow"><Icon name="arrow" size={14}/></span>
      </div>
    </div>
  );
};

export default SportFilter;
