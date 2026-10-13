-- ============================================================
-- 005_create_notifications: 通知表
-- 站内通知：有人加入、局即将开始、新消息、局取消、成员退出
-- ============================================================

-- 通知类型枚举（幂等）
DO $$ BEGIN
    CREATE TYPE notification_type_enum AS ENUM (
        'member_joined', 'game_ready', 'new_message',
        'game_cancelled', 'member_left',
        'check_in_reminder', 'reward_granted',
        'penalty_applied', 'game_full'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 通知表
CREATE TABLE IF NOT EXISTS notifications (
    id              BIGSERIAL               PRIMARY KEY,
    user_id         BIGINT                  NOT NULL,
    type            notification_type_enum  NOT NULL,
    title           VARCHAR(100)            NOT NULL,
    content         VARCHAR(300)            NOT NULL,
    game_id         BIGINT                  NULL DEFAULT NULL,
    is_read         BOOLEAN                 NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP               NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_notify_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_notify_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE SET NULL
);

-- 拉取用户未读通知列表
CREATE INDEX IF NOT EXISTS idx_notify_user_unread
    ON notifications(user_id, is_read, created_at);

CREATE INDEX IF NOT EXISTS idx_notify_created_at ON notifications(created_at);

-- 列注释
COMMENT ON TABLE notifications IS '通知表';
COMMENT ON COLUMN notifications.id IS '通知ID';
COMMENT ON COLUMN notifications.user_id IS '接收者用户ID';
COMMENT ON COLUMN notifications.type IS '通知类型：member_joined/game_ready/new_message/game_cancelled/member_left/check_in_reminder/reward_granted/penalty_applied/game_full';
COMMENT ON COLUMN notifications.title IS '通知标题';
COMMENT ON COLUMN notifications.content IS '通知内容';
COMMENT ON COLUMN notifications.game_id IS '关联运动局ID（可为NULL）';
COMMENT ON COLUMN notifications.is_read IS '是否已读';
COMMENT ON COLUMN notifications.created_at IS '创建时间';
