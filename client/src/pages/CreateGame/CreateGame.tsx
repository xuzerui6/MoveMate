/**
 * 发局页 —— 创建运动局 (极简现代风格)
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../../hooks/useAuth';
import * as gamesApi from '../../api/games';
import * as authApi from '../../api/auth';
import { getErrorMessage } from '../../api/client';
import SportPicker from '../../components/SportPicker';
import { useAuthStore } from '../../stores/authStore';
import { SPORT_LABELS } from '../../types';
import type { SportType, GameTag, Campus, Venue } from '../../types';

const TAGS: { value: GameTag; label: string; color: string }[] = [
  { value: 'casual', label: '娱乐局', color: '#10B981' },
  { value: 'beginner_friendly', label: '新手友好', color: '#3B82F6' },
  { value: 'competitive', label: '认真局', color: '#EF4444' },
  { value: 'relaxed', label: '养生局', color: '#F59E0B' },
];

function getDefaultTime(): string {
  const now = new Date();
  now.setHours(19, 0, 0, 0);
  if (now.getTime() < Date.now()) {
    now.setDate(now.getDate() + 1);
  }
  return formatDateTimeLocal(now);
}

function getDefaultEndTime(start: string): string {
  const date = new Date(start);
  date.setHours(date.getHours() + 2);
  return formatDateTimeLocal(date);
}

function pad(num: number): string {
  return String(num).padStart(2, '0');
}

function formatDateTimeLocal(date: Date): string {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const CreateGame: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const defaultStartTime = getDefaultTime();
  const minStartTime = useMemo(() => formatDateTimeLocal(new Date()), []);

  const [bootstrapError,setBootstrapError]=useState('');
  const [sportType, setSportType] = useState<SportType | undefined>();
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState(getDefaultEndTime(defaultStartTime));
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [campusId, setCampusId] = useState<number | ''>(user?.campus_id || '');
  const [venueId, setVenueId] = useState<number | ''>('');
  const [locationInput, setLocationInput] = useState('');
  const [meetingNote, setMeetingNote] = useState('');
  const [maxParticipants, setMaxParticipants] = useState(2);
  const [tag, setTag] = useState<GameTag | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [showVenueRecommendations, setShowVenueRecommendations] = useState(false);

  useEffect(() => {
    authApi.fetchBootstrap()
      .then((data) => {
        setCampuses(data.campuses || []);
        setVenues(data.venues || []);
        if (!campusId && (user?.campus_id || data.campuses?.[0]?.id)) {
          setCampusId(user?.campus_id || data.campuses?.[0]?.id || '');
        }
      })
      .catch((e) => {
        setBootstrapError(getErrorMessage(e));
        setCampuses([]);
        setVenues([]);
      });
  }, []);

  const venueOptions = useMemo(() => {
    const filtered = venues.filter((venue) => {
      if (!campusId || venue.campus_id !== Number(campusId)) return false;
      if (!sportType) return true;
      let sportTypes: string[] = [];
      if (Array.isArray(venue.sport_types)) {
        sportTypes = venue.sport_types;
      } else {
        // 容错：坏 JSON 不崩溃，按无限制处理
        try {
          const parsed = JSON.parse((venue.sport_types as string) || '[]');
          sportTypes = Array.isArray(parsed) ? parsed : [];
        } catch {
          sportTypes = [];
        }
      }
      return sportTypes.length === 0 || sportTypes.includes(sportType);
    });
    return filtered.sort((a, b) => {
      const score = (venue: Venue) => {
        let total = 0;
        if (venue.id === venueId) total += 1000;
        if (venue.name.includes('宋治平体育馆')) total += 300;
        if (venue.name.includes('体育馆')) total += 180;
        else if (venue.name.includes('馆')) total += 120;
        if (venue.name.includes('比赛馆') || venue.name.includes('训练馆')) total += 40;
        return total;
      };
      const diff = score(b) - score(a);
      if (diff !== 0) return diff;
      return Number(b.id) - Number(a.id);
    });
  }, [venues, campusId, sportType, venueId]);

  useEffect(() => {
    setVenueId('');
    setLocationInput('');
  }, [campusId, sportType]);

  useEffect(() => {
    if (!startTime) return;
    const nextDefaultEnd = getDefaultEndTime(startTime);
    if (!endTime || endTime <= startTime) {
      setEndTime(nextDefaultEnd);
    }
  }, [startTime]);

  const canSubmit =
    sportType &&
    sportType.trim().length > 0 &&
    campusId &&
    startTime &&
    endTime &&
    endTime > startTime &&
    maxParticipants >= 2 &&
    locationInput.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || !sportType) return;
    setSubmitting(true);
    try {
      const res = await gamesApi.createGame({
        sport_type: sportType.trim(),
        campus_id: Number(campusId),
        venue_id: venueId ? Number(venueId) : undefined,
        location: locationInput.trim(),
        meeting_note: meetingNote.trim() || undefined,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        max_players: maxParticipants,
        tag,
      }) as any;
      const game = res.data?.game || res.data || res;
      showToast('发局成功！', 'success');
      navigate(`/game/${game.id}`, { replace: true });
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <div className="ui-pages-creategame-creategame-container">
      <div className="ui-pages-creategame-creategame-topBar">
        <button onClick={handleBack} className="ui-pages-creategame-creategame-backBtn">
          取消
        </button>
        <h2 className="ui-pages-creategame-creategame-pageTitle">发起组局</h2>
        <div className="ui-pages-creategame-creategame-inline-0" />
      </div>

      <div className="ui-pages-creategame-creategame-section">
{bootstrapError&&<div className="inline-error" role="alert"><p>校区和场地信息暂时无法读取：{bootstrapError}</p><button type="button" className="btn btn--secondary" onClick={()=>window.location.reload()}>重新加载</button></div>}
        <label className="form-label">运动类型</label>
        <SportPicker value={sportType} onChange={setSportType} />
      </div>

      <div  className="create-game-grid ui-pages-creategame-creategame-gridSection">
        <div  className="create-game-grid__item ui-pages-creategame-creategame-halfWidth">
          <label className="form-label">开始时间</label>
          <input
            className="form-input form-input--datetime"
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            min={minStartTime}
          />
        </div>
        <div  className="create-game-grid__item ui-pages-creategame-creategame-halfWidth">
          <label className="form-label">结束时间</label>
          <input
            className="form-input form-input--datetime"
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            min={startTime || minStartTime}
          />
        </div>
      </div>

      <div className="ui-pages-creategame-creategame-section">
        <label className="form-label">校区</label>
        <select
          className="form-select"
          value={campusId}
          onChange={(e) => setCampusId(e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">请选择校区</option>
          {campuses.map((campus) => (
            <option key={campus.id} value={campus.id}>
              {campus.name}
            </option>
          ))}
        </select>
      </div>

      <div className="ui-pages-creategame-creategame-section">
        <label className="form-label">场地</label>
        <input
          className="form-input"
          type="text"
          value={locationInput}
          onChange={(e) => {
            const next = e.target.value;
            setLocationInput(next);
            const matchedVenue = venueOptions.find((venue) => venue.name === next.trim());
            setVenueId(matchedVenue?.id || '');
          }}
          placeholder={sportType ? `搜索或输入场地，如：${SPORT_LABELS[sportType] || sportType}场` : '搜索或输入场地'}
          disabled={!campusId}
          maxLength={200}
        />
        {campusId && venueOptions.length > 0 && (
          <div className="ui-pages-creategame-creategame-recommendBox">
            <div className="ui-pages-creategame-creategame-recommendHeader">
              <div className="ui-pages-creategame-creategame-recommendMeta">
                <span className="ui-pages-creategame-creategame-recommendTitle">推荐场地</span>
              </div>
            </div>

            <div className="ui-pages-creategame-creategame-venueList">
              {(showVenueRecommendations ? venueOptions : venueOptions.slice(0, 3)).map((venue) => {
                const isActive = venueId === venue.id;
                return (
                  <div
                    key={venue.id}
                    role="button"
                    tabIndex={0}
                    className="ui-pages-creategame-creategame-venueChip" style={{...(isActive ? styles.venueChipActive : {})}}
                    onClick={() => {
                      setVenueId(venue.id);
                      setLocationInput(venue.name);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setVenueId(venue.id);
                        setLocationInput(venue.name);
                      }
                    }}
                  >
                    {venue.name}
                  </div>
                );
              })}
            </div>

            {venueOptions.length > 3 && (
              <button
                type="button"
                className="ui-pages-creategame-creategame-venueMoreToggle"
                onClick={() => setShowVenueRecommendations((prev) => !prev)}
              >
                {showVenueRecommendations ? '收起更多场地' : `展开更多场地（共 ${venueOptions.length} 个）`}
                <span className="ui-pages-creategame-creategame-inline-1" style={{transform: showVenueRecommendations ? 'rotate(180deg)' : 'rotate(0deg)'}}>▾</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="ui-pages-creategame-creategame-section">
        <label className="form-label">集合说明 / 备注（选填）</label>
        <p className="ui-pages-creategame-creategame-fieldHint">
          可写集合点、识别方式，或需要提前说明的小提醒。
        </p>
        <input
          className="form-input"
          type="text"
          value={meetingNote}
          onChange={(e) => setMeetingNote(e.target.value)}
          placeholder="例如：东操场看台旁集合，穿白色球衣更好认"
          maxLength={200}
        />
      </div>

      <div  className="create-game-grid ui-pages-creategame-creategame-gridSection">
        <div  className="create-game-grid__item ui-pages-creategame-creategame-halfWidth">
          <label className="form-label">总人数（含自己）</label>
          <div className="ui-pages-creategame-creategame-counterRow">
            <button
              className="btn btn--secondary ui-pages-creategame-creategame-counterBtn"
              
              onClick={() => setMaxParticipants(Math.max(2, maxParticipants - 1))}
              disabled={maxParticipants <= 2}
              type="button"
            >
              −
            </button>
            <span className="ui-pages-creategame-creategame-counterValue">{maxParticipants}</span>
            <button
              className="btn btn--secondary ui-pages-creategame-creategame-counterBtn"
              
              onClick={() => setMaxParticipants(Math.min(20, maxParticipants + 1))}
              disabled={maxParticipants >= 20}
              type="button"
            >
              +
            </button>
          </div>
        </div>

        <div  className="create-game-grid__item ui-pages-creategame-creategame-halfWidth">
          <label className="form-label">标签（选填）</label>
          <div className="ui-pages-creategame-creategame-tagRow">
            {TAGS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTag(tag === t.value ? undefined : t.value)}
                className="ui-pages-creategame-creategame-tagBtn" style={{background: tag === t.value ? '#123e29' : '#f3f6f3',color: tag === t.value ? '#FFF' : '#64748B',borderColor: tag === t.value ? '#123e29' : '#E2E8F0'}}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="ui-pages-creategame-creategame-submitArea">
        <button
          className="btn btn--primary btn--lg btn--block"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
        >
          {submitting ? '发布中...' : '发布'}
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '0.5rem',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '2rem',
  },
  backBtn: {
    fontSize: '0.9375rem',
    color: '#64748B',
    padding: '0.25rem 0',
  },
  pageTitle: {
    fontSize: '1.125rem',
    fontWeight: 800,
    color: '#123e29',
  },
  section: {
    marginBottom: '1.75rem',
  },
  fieldHint: {
    marginTop: '-0.35rem',
    marginBottom: '0.55rem',
    fontSize: '0.75rem',
    color: '#74817a',
    lineHeight: 1.5,
  },
  gridSection: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '1.75rem',
  },
  halfWidth: {
    flex: 1,
    minWidth: 0,
  },
  venueList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    marginTop: '0.75rem',
  },
  recommendBox: {
    marginTop: '0.75rem',
    padding: '0.9rem 1rem',
    borderRadius: '14px',
    background: '#f3f6f3',
    border: '1px solid #EEF2F7',
  },
  recommendHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
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
  recommendDesc: {
    fontSize: '0.75rem',
    color: '#64748B',
    fontWeight: 500,
  },
  venueChip: {
    padding: '0.4rem 0.75rem',
    borderRadius: '8px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#E2E8F0',
    background: '#f3f6f3',
    color: '#475569',
    fontSize: '0.8125rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 150ms ease',
    outline: 'none',
    boxShadow: 'none',
    WebkitTapHighlightColor: 'transparent',
    userSelect: 'none',
  },
  venueChipActive: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#123e29',
    background: '#123e29',
    color: '#FFFFFF',
    outline: 'none',
    boxShadow: '0 10px 20px rgba(15, 23, 42, 0.12)',
  },
  venueMoreToggle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: '0.5rem',
    padding: '0.5rem 0',
    fontSize: '0.8125rem',
    color: '#6B7280',
    fontWeight: 500,
    background: 'none',
    border: '1px dashed #D1D5DB',
    borderRadius: '0.75rem',
    cursor: 'pointer',
  },
  counterRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: '#f3f6f3',
    border: '1px solid #E2E8F0',
    borderRadius: '12px',
    padding: '0.25rem',
    height: '46px',
  },
  counterBtn: {
    width: '32px',
    height: '32px',
    padding: 0,
    borderRadius: '8px',
    fontSize: '1.25rem',
    background: '#FFFFFF',
    border: 'none',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
  counterValue: {
    fontSize: '1rem',
    fontWeight: 700,
    color: '#123e29',
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.4rem',
  },
  tagBtn: {
    padding: '0.3rem 0.6rem',
    borderRadius: '6px',
    border: '1px solid',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  submitArea: {
    marginTop: '2.5rem',
    paddingBottom: '2rem',
  },
};

export default CreateGame;
