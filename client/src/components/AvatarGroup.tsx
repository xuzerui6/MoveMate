/**
 * 参与者头像叠放组件 —— 最多展示 4 个头像，超出显示 +N
 */
import React from 'react';

interface Participant {
  id?: string;
  user_id?: string;
  nickname: string;
  avatar?: string;
}

interface Props {
  participants: Participant[];
  max?: number; // 最多展示头像数，默认 4
}

/** 获取头像展示文字（取昵称首字） */
function getAvatarText(nickname: string): string {
  return nickname?.charAt(0) || '?';
}

/** 生成头像背景色（基于昵称哈希，保证同用户颜色一致） */
function getAvatarColor(name: string): string {
  const colors = [
    '#FF6B35', '#004E89', '#1A936F', '#9B5DE5',
    '#F72585', '#4361EE', '#4CC9F0', '#F8961E',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

const AvatarGroup: React.FC<Props> = ({ participants, max = 4 }) => {
  if (!participants || participants.length === 0) {
    return null;
  }

  const visible = participants.slice(0, max);
  const remaining = participants.length - max;

  return (
    <div className="avatar-group">
      {visible.map((p, i) => (
        <div
          key={p.id || p.user_id || i}
          className="avatar avatar--sm"
          style={{
            backgroundColor: getAvatarColor(p.nickname),
            zIndex: max - i,
          }}
          title={p.nickname}
        >
          {p.avatar ? (
            <img src={p.avatar} alt={p.nickname} />
          ) : (
            getAvatarText(p.nickname)
          )}
        </div>
      ))}
      {remaining > 0 && (
        <div  className={["avatar-group__more","ui-components-avatargroup-inline-0"].filter(Boolean).join(" ")}>
          +{remaining}
        </div>
      )}
    </div>
  );
};

export default AvatarGroup;
