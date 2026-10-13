-- ============================================================
-- 004_create_chat_messages: 聊天消息表
-- 局内群聊消息，按局拉取 + 游标翻页
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_messages (
    id              BIGSERIAL       PRIMARY KEY,
    game_id         BIGINT          NOT NULL,
    sender_id       BIGINT          NOT NULL,
    content         VARCHAR(500)    NOT NULL,
    created_at      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_chat_game FOREIGN KEY (game_id) REFERENCES games(id),
    CONSTRAINT fk_chat_sender FOREIGN KEY (sender_id) REFERENCES users(id)
);

-- 按局拉取消息，时间排序（游标翻页用）
CREATE INDEX IF NOT EXISTS idx_chat_game_time
    ON chat_messages(game_id, created_at);

CREATE INDEX IF NOT EXISTS idx_chat_sender ON chat_messages(sender_id);

-- 列注释
COMMENT ON TABLE chat_messages IS '聊天消息表';
COMMENT ON COLUMN chat_messages.id IS '消息ID';
COMMENT ON COLUMN chat_messages.game_id IS '所属运动局ID';
COMMENT ON COLUMN chat_messages.sender_id IS '发送者用户ID';
COMMENT ON COLUMN chat_messages.content IS '消息内容（纯文本，1-500字符）';
COMMENT ON COLUMN chat_messages.created_at IS '发送时间（毫秒精度）';
