/**
 * 运动局卡片 —— 大厅列表的单个卡片 (极简现代风格)
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { Game } from '../../types';
import { SPORT_LABELS, TAG_LABELS } from '../../types';
import StateBadge from '../../components/StateBadge';
import AvatarGroup from '../../components/AvatarGroup';
import SportIcon from '../../components/SportIcon';

interface Props {
  game: Game;
  hideActionBtn?: boolean;
  customActionBtn?: React.ReactNode;
}

/** 格式化时间为可读字符串 */
function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  const hour = d.getHours().toString().padStart(2, '0');
  const minute = d.getMinutes().toString().padStart(2, '0');
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (d.toDateString() === today.toDateString()) {
    return `今天 ${hour}:${minute}`;
  }
  if (d.toDateString() === tomorrow.toDateString()) {
    return `明天 ${hour}:${minute}`;
  }
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hour}:${minute}`;
}

function formatTimeRange(start: string, end: string | null): string {
  if (!end) return formatTime(start);
  const startDate = new Date(start);
  const endDate = new Date(end);
  const endHour = endDate.getHours().toString().padStart(2, '0');
  const endMinute = endDate.getMinutes().toString().padStart(2, '0');

  if (startDate.toDateString() === endDate.toDateString()) {
    return `${formatTime(start)} - ${endHour}:${endMinute}`;
  }
  return `${formatTime(start)} - ${formatTime(end)}`;
}

/** 计算剩余人数 */
function getRemaining(game: Game): number {
  return Math.max(0, game.max_players - game.member_count);
}

function getHostLevelText(level?: number): string {
  return `Lv.${level || 1}`;
}

const GameCard: React.FC<Props> = ({ game, hideActionBtn = false, customActionBtn }) => {
  const navigate = useNavigate();
  const remaining = getRemaining(game);
  const sportLabel = SPORT_LABELS[game.sport_type] || game.sport_type;
  const isHost = Boolean(game.is_host);
  const isMember = Boolean(game.is_member);
  const canJoin = !isHost && !isMember && game.status === 'recruiting';
  
  // 极简的关系徽标
  const relationLabel = isHost ? '我的局' : (isMember ? '已加入' : '');
  const actionLabel = isHost
    ? '管理'
    : isMember
      ? '查看'
      : canJoin
        ? '加入'
        : '查看';

  return (
    <div role="link" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')navigate('/game/'+game.id);}} className="card card--clickable ui-pages-lobby-gamecard-card" onClick={() => navigate(`/game/${game.id}`)} >
      {/* 顶部：标题、状态、关系标签 */}
      <div className="ui-pages-lobby-gamecard-topRow">
        <div className="ui-pages-lobby-gamecard-sportInfo">
          <span className="ui-pages-lobby-gamecard-sportIconWrapper">
            <SportIcon sport={game.sport_type} size={26} color="#08783b" />
          </span>
          <div className="ui-pages-lobby-gamecard-sportTitleBlock">
            <div className="ui-pages-lobby-gamecard-titleRow">
              <span className="ui-pages-lobby-gamecard-sportName">{sportLabel}</span>
              {relationLabel && (
                <span className={isHost ? "ui-pages-lobby-gamecard-relationChipHost" : "ui-pages-lobby-gamecard-relationChipMember"}>
                  {relationLabel}
                </span>
              )}
              {game.visibility === 'friends' && (
                <span className="ui-pages-lobby-gamecard-friendsChip">好友局</span>
              )}
            </div>
            {game.tag && (
              <span className="ui-pages-lobby-gamecard-tag">
                {TAG_LABELS[game.tag]}
              </span>
            )}
            <div className="ui-pages-lobby-gamecard-hostMetaRow">
              <span className="ui-pages-lobby-gamecard-hostName">
                发起人 {game.creator_name || '匿名用户'}
              </span>
              <span className="ui-pages-lobby-gamecard-hostLevelChip">
                {getHostLevelText(game.host_reward_level)}
                {' · '}
                {game.host_reward_points || 0} XP
              </span>
            </div>
          </div>
        </div>
        <StateBadge state={game.status} />
      </div>

      {/* 中间：信息区 */}
      <div className="ui-pages-lobby-gamecard-infoBox">
        <div className="ui-pages-lobby-gamecard-infoRow">
          <span className="ui-pages-lobby-gamecard-infoLabel">时间</span>
          <span className="ui-pages-lobby-gamecard-infoTextValue">{formatTimeRange(game.start_time, game.end_time)}</span>
        </div>
        <div className="ui-pages-lobby-gamecard-infoRow">
          <span className="ui-pages-lobby-gamecard-infoLabel">地点</span>
          <span className="ui-pages-lobby-gamecard-infoTextValue">
            {game.school_name || '吉林大学'} {game.campus_name ? `· ${game.campus_name}` : ''} {game.venue_name || game.location}
          </span>
        </div>
        {game.meeting_note && (
          <div className="ui-pages-lobby-gamecard-infoRow">
            <span className="ui-pages-lobby-gamecard-infoLabel">备注</span>
            <span className="ui-pages-lobby-gamecard-infoTextValue">{game.meeting_note}</span>
          </div>
        )}
      </div>

      {/* 底部：参与者 + 按钮 */}
      <div className="ui-pages-lobby-gamecard-bottomRow">
        <div className="ui-pages-lobby-gamecard-participants">
          {game.participants && game.participants.length > 0 && (
            <AvatarGroup participants={game.participants} max={4} />
          )}
          <div className="ui-pages-lobby-gamecard-countBlock">
            <span className="ui-pages-lobby-gamecard-countText">{game.member_count}/{game.max_players} 人</span>
            {remaining > 0 && ['recruiting', 'full', 'ready'].includes(game.status) && <span className="ui-pages-lobby-gamecard-remainingText">缺 {remaining} 人</span>}
          </div>
        </div>

        {customActionBtn ? (
          customActionBtn
        ) : (
          !hideActionBtn && (
            <button
              className={(`btn ${canJoin ? 'btn--primary' : 'btn--secondary'}`)+" ui-pages-lobby-gamecard-actionBtn"}
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/game/${game.id}`);
              }}
              
            >
              {actionLabel}
            </button>
          )
        )}
      </div>
    </div>
  );
};

export default GameCard;
