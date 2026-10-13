import {Icon} from '../../features/motion/components/Icons';
/**
 * 聊天消息列表 —— 气泡式展示，区分自己/他人
 * MVP：纯文字消息，不支持图片/表情
 */
import React, { useRef, useEffect } from 'react';
import type { Message } from '../../types';
import { useAuthStore } from '../../stores/authStore';

interface Props {
  messages: Message[];
  bottomRef: React.Ref<HTMLDivElement>;
}

function getColor(name: string): string {
  const colors = [
    '#009c55', '#004E89', '#1A936F', '#9B5DE5',
    '#F72585', '#4361EE',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

/** 判断是否需要显示时间分隔线 */
function shouldShowDivider(
  messages: Message[],
  index: number
): boolean {
  if (index === 0) return false;
  const prev = new Date(messages[index - 1].created_at).getTime();
  const curr = new Date(messages[index].created_at).getTime();
  return curr - prev > 5 * 60 * 1000; // 超过 5 分钟显示分隔线
}

const ChatList: React.FC<Props> = ({ messages, bottomRef }) => {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="ui-pages-gamedetail-chatlist-container">
      {messages.length === 0 ? (
        <div className="ui-pages-gamedetail-chatlist-empty">
          <p className="ui-pages-gamedetail-chatlist-emptyIcon"><Icon name="users" size={30}/></p>
          <p className="ui-pages-gamedetail-chatlist-emptyText">暂无消息</p>
          <p className="ui-pages-gamedetail-chatlist-emptyHint">发送第一条消息开始协调吧</p>
        </div>
      ) : (
        messages.map((msg, idx) => {
          const isMine = msg.sender_id === user?.id;
          const showDivider = shouldShowDivider(messages, idx);

          return (
            <React.Fragment key={msg.id}>
              {/* 时间分隔线 */}
              {showDivider && (
                <div className="chat-divider">
                  <span>{formatTime(msg.created_at)}</span>
                </div>
              )}

              {/* 消息气泡 */}
              <div
                className={`chat-message ${isMine ? 'chat-message--mine' : ''}`}
              >
                {/* 头像 */}
                {!isMine && (
                  <div className="chat-message__avatar">
                    <div
                      className="ui-pages-gamedetail-chatlist-msgAvatar" style={{backgroundColor: getColor(msg.sender_name)}}
                    >
                      {msg.sender_name?.charAt(0) || '?'}
                    </div>
                  </div>
                )}

                {/* 气泡 */}
                <div>
                  {/* 发送者名称（非自己的消息） */}
                  {!isMine && (
                    <div className="ui-pages-gamedetail-chatlist-senderName">{msg.sender_name}</div>
                  )}
                  <div className="chat-message__bubble">{msg.content}</div>
                  <div className="chat-message__time">
                    {formatTime(msg.created_at)}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })
      )}

      {/* 滚动锚点 */}
      <div ref={bottomRef as React.RefObject<HTMLDivElement>} />
    </div>
  );
};



export default ChatList;
