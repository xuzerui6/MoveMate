/**
 * 局信息头部 —— 显示运动类型、状态、地点、时间、人数 (现代极简风格)
 */
import React from 'react';
import type { Game } from '../../types';
import { SPORT_LABELS, TAG_LABELS } from '../../types';
import StateBadge from '../../components/StateBadge';
import CountdownBadge from '../../components/CountdownBadge';
import {Icon} from '../../features/motion/components/Icons';

interface Props {
  game: Game;
}

function formatDateTime(isoStr: string): string {
  const d = new Date(isoStr);
  const hour = d.getHours().toString().padStart(2, '0');
  const minute = d.getMinutes().toString().padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hour}:${minute}`;
}

function formatTimeRange(start: string, end: string | null): string {
  if (!end) return formatDateTime(start);
  const startDate = new Date(start);
  const endDate = new Date(end);
  const sameDay = startDate.toDateString() === endDate.toDateString();
  const endHour = endDate.getHours().toString().padStart(2, '0');
  const endMinute = endDate.getMinutes().toString().padStart(2, '0');

  if (sameDay) {
    return `${formatDateTime(start)} - ${endHour}:${endMinute}`;
  }
  return `${formatDateTime(start)} - ${formatDateTime(end)}`;
}

const GameHeader: React.FC<Props> = ({ game }) => {
  const label = SPORT_LABELS[game.sport_type] || game.sport_type;
  const waitingToStart = ['recruiting', 'full', 'ready'].includes(game.status);

  return (
    <div className="ui-pages-gamedetail-gameheader-container">
      <div className="ui-pages-gamedetail-gameheader-topRow">
        <div className="ui-pages-gamedetail-gameheader-sportInfo">
          <div className="ui-pages-gamedetail-gameheader-titleBlock">
            <div className="ui-pages-gamedetail-gameheader-titleRow">
              <StateBadge state={game.status} />
            </div>
            {game.tag && (
              <span className="ui-pages-gamedetail-gameheader-tag">
                {TAG_LABELS[game.tag]}
              </span>
            )}
          </div>
        </div>
      </div>
      <h1 className="activity-title">{game.title || label}</h1>

      <div className="ui-pages-gamedetail-gameheader-detailsBox">
        <div className="ui-pages-gamedetail-gameheader-detailRow">
          <Icon name="calendar" size={16}/>
          <div className="ui-pages-gamedetail-gameheader-detailValue">
            <span>{formatTimeRange(game.start_time, game.end_time)}</span>
            {waitingToStart && <CountdownBadge startTime={game.start_time} />}
          </div>
        </div>

        <div className="ui-pages-gamedetail-gameheader-detailRow">
          <Icon name="pin" size={16}/>
          <span className="ui-pages-gamedetail-gameheader-detailValue">
            {game.campus_name ? `${game.campus_name} · ` : ''}{game.venue_name || game.location}
          </span>
        </div>

        {game.meeting_note && (
          <div className="ui-pages-gamedetail-gameheader-detailRow">
            <span className="ui-pages-gamedetail-gameheader-detailLabel">备注</span>
            <span className="ui-pages-gamedetail-gameheader-detailValue">{game.meeting_note}</span>
          </div>
        )}

        <div className="ui-pages-gamedetail-gameheader-detailRow">
          <Icon name="users" size={16}/>
          <span className="ui-pages-gamedetail-gameheader-detailValue">
            {game.member_count} / {game.max_players} 人 · 发起人：{game.participants?.find((p: any) => Number(p.user_id) === Number(game.host_id))?.nickname || `用户${game.host_id}`}
            {waitingToStart && game.member_count < game.max_players && (
              <span className="ui-pages-gamedetail-gameheader-remaining">
                （还差 {game.max_players - game.member_count} 人）
              </span>
            )}
          </span>
        </div>

      </div>
    </div>
  );
};



export default GameHeader;
