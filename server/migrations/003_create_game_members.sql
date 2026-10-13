-- ============================================================
-- 003_create_game_members: 局成员关系表
-- 记录用户加入/退出运动局的历史，软删除模式
-- ============================================================

CREATE TABLE IF NOT EXISTS game_members (
    id              BIGSERIAL       PRIMARY KEY,
    game_id         BIGINT          NOT NULL,
    user_id         BIGINT          NOT NULL,
    joined_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    left_at         TIMESTAMP       NULL DEFAULT NULL,

    CONSTRAINT fk_members_game FOREIGN KEY (game_id) REFERENCES games(id),
    CONSTRAINT fk_members_user FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 同一用户对同一局只能有一条活跃记录（left_at IS NULL）
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_user_active
    ON game_members(game_id, user_id)
    WHERE left_at IS NULL;

-- 查询用户参与过的局
CREATE INDEX IF NOT EXISTS idx_members_user_joined
    ON game_members(user_id, joined_at);

-- 查询局内活跃成员
CREATE INDEX IF NOT EXISTS idx_members_game_active
    ON game_members(game_id, left_at);

-- 列注释
COMMENT ON TABLE game_members IS '局成员关系表';
COMMENT ON COLUMN game_members.id IS '记录ID';
COMMENT ON COLUMN game_members.game_id IS '运动局ID';
COMMENT ON COLUMN game_members.user_id IS '用户ID';
COMMENT ON COLUMN game_members.joined_at IS '加入时间';
COMMENT ON COLUMN game_members.left_at IS '退出时间，NULL表示仍在局中';
