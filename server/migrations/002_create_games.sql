-- ============================================================
-- 002_create_games: 运动局表（核心）
-- 存储所有运动局的完整信息，含状态机枚举
-- ============================================================

-- 创建枚举类型（幂等：已存在则跳过）
DO $$ BEGIN
    CREATE TYPE sport_type_enum AS ENUM (
        'basketball', 'badminton', 'running', 'fitness', 'soccer'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE game_status_enum AS ENUM (
        'recruiting', 'full', 'ready', 'in_progress',
        'completed', 'archived', 'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE game_tag_enum AS ENUM (
        'casual', 'beginner_friendly', 'competitive', 'relaxed'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 运动局表
CREATE TABLE IF NOT EXISTS games (
    id              BIGSERIAL           PRIMARY KEY,
    host_id         BIGINT              NOT NULL,
    sport_type      sport_type_enum     NOT NULL,
    title           VARCHAR(50)         NOT NULL DEFAULT '',
    location        VARCHAR(200)        NOT NULL,
    max_players     SMALLINT            NOT NULL,
    start_time      TIMESTAMP           NOT NULL,
    end_time        TIMESTAMP           NULL DEFAULT NULL,
    completed_at    TIMESTAMP           NULL DEFAULT NULL,
    status          game_status_enum    NOT NULL DEFAULT 'recruiting',
    tag             game_tag_enum       NULL DEFAULT NULL,
    member_count    SMALLINT            NOT NULL DEFAULT 1,
    created_at      TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_games_host FOREIGN KEY (host_id) REFERENCES users(id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_games_host ON games(host_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_sport_type ON games(sport_type);
CREATE INDEX IF NOT EXISTS idx_games_start_time ON games(start_time);
CREATE INDEX IF NOT EXISTS idx_games_lobby ON games(status, start_time);
CREATE INDEX IF NOT EXISTS idx_games_auto_task ON games(status, start_time);

-- updated_at 触发器
DROP TRIGGER IF EXISTS trg_games_updated_at ON games;
CREATE TRIGGER trg_games_updated_at
    BEFORE UPDATE ON games
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 列注释
COMMENT ON TABLE games IS '运动局表（核心）';
COMMENT ON COLUMN games.id IS '运动局ID';
COMMENT ON COLUMN games.host_id IS '发起人用户ID';
COMMENT ON COLUMN games.sport_type IS '运动类型：basketball/badminton/running/fitness/soccer';
COMMENT ON COLUMN games.title IS '标题，空则由前端自动生成';
COMMENT ON COLUMN games.location IS '活动地点';
COMMENT ON COLUMN games.max_players IS '最大人数（含发起人），>=3';
COMMENT ON COLUMN games.start_time IS '预计开始时间';
COMMENT ON COLUMN games.end_time IS '预计/实际结束时间';
COMMENT ON COLUMN games.completed_at IS '实际结束确认时间';
COMMENT ON COLUMN games.status IS '状态：recruiting/full/ready/in_progress/completed/archived/cancelled';
COMMENT ON COLUMN games.tag IS '局标签：casual/beginner_friendly/competitive/relaxed';
COMMENT ON COLUMN games.member_count IS '当前成员数（冗余计数器）';
COMMENT ON COLUMN games.created_at IS '创建时间';
COMMENT ON COLUMN games.updated_at IS '最后更新时间';
