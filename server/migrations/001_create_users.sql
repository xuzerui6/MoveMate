-- ============================================================
-- 001_create_users: 用户表
-- 存储校园用户基本信息，邮箱/学号唯一
-- ============================================================

-- 创建自动更新 updated_at 的触发器函数（供所有表复用）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id              BIGSERIAL       PRIMARY KEY,
    nickname        VARCHAR(20)     NOT NULL,
    email           VARCHAR(255)    NOT NULL,
    password_hash   VARCHAR(255)    NOT NULL,
    avatar_url      VARCHAR(500)    NOT NULL DEFAULT '',
    department      VARCHAR(100)    NOT NULL DEFAULT '',
    student_id      VARCHAR(50)     NOT NULL,
    email_verified  BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 唯一索引：邮箱 & 学号
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_student_id ON users(student_id);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- updated_at 自动更新触发器
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 列注释
COMMENT ON TABLE users IS '用户表';
COMMENT ON COLUMN users.id IS '用户ID';
COMMENT ON COLUMN users.nickname IS '昵称，1-20字符';
COMMENT ON COLUMN users.email IS '校园邮箱，唯一';
COMMENT ON COLUMN users.password_hash IS 'bcrypt 密码哈希';
COMMENT ON COLUMN users.avatar_url IS '头像URL，空则由前端生成默认头像';
COMMENT ON COLUMN users.department IS '院系，可选';
COMMENT ON COLUMN users.student_id IS '学号，SHA256+盐脱敏存储';
COMMENT ON COLUMN users.email_verified IS '邮箱是否已验证';
COMMENT ON COLUMN users.created_at IS '注册时间';
COMMENT ON COLUMN users.updated_at IS '最后更新时间';
