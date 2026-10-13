# 《搭个局》后端 API 与数据模型设计

> 对应 PRD v2 | 设计日期：2026-05-29 | MVP 阶段

---

## 目录

1. [API 设计](#1-api-设计)
2. [数据模型](#2-数据模型)
3. [状态机实现方案](#3-状态机实现方案)
4. [通知系统设计](#4-通知系统设计)

---

## 1. API 设计

### 1.0 通用约定

- **Base URL**: `/api/v1`
- **认证方式**: Bearer Token (JWT)，请求头 `Authorization: Bearer <token>`
- **响应格式**:

```json
{
  "code": 0,
  "message": "success",
  "data": { ... }
}
```

- **错误响应**:

```json
{
  "code": 40001,
  "message": "该局已满员",
  "data": null
}
```

- **分页**: `GET /api/v1/games?page=1&page_size=20`，响应含 `pagination: { page, page_size, total, total_pages }`

---

### 1.1 认证模块

#### `POST /api/v1/auth/register`

注册新用户。

| 项目 | 说明 |
|------|------|
| **权限** | 无需登录 |
| **请求体** | `{ "nickname": "string (必填, 1-20字符)", "email": "string (必填, 校园邮箱)", "password": "string (必填, 6-32字符)", "student_id": "string (必填)", "department": "string (可选)" }` |
| **响应** | `{ "user": { ... }, "token": "jwt_string" }` |
| **业务规则** | 邮箱唯一性校验；发送验证邮件；注册后默认登录 |

#### `POST /api/v1/auth/login`

登录。

| 项目 | 说明 |
|------|------|
| **权限** | 无需登录 |
| **请求体** | `{ "email": "string", "password": "string" }` |
| **响应** | `{ "user": { ... }, "token": "jwt_string" }` |

#### `POST /api/v1/auth/verify-email`

验证校园邮箱。

| 项目 | 说明 |
|------|------|
| **权限** | 需登录 |
| **请求体** | `{ "code": "string (6位验证码)" }` |
| **响应** | `{ "verified": true }` |
| **业务规则** | 验证码有效期 10 分钟；未验证邮箱可登录但无法加入/创建局 |

#### `POST /api/v1/auth/refresh-token`

刷新 Token。

| 项目 | 说明 |
|------|------|
| **权限** | 需登录 |
| **响应** | `{ "token": "new_jwt_string" }` |

---

### 1.2 用户模块

#### `GET /api/v1/users/me`

获取当前用户资料。

| 项目 | 说明 |
|------|------|
| **权限** | 需登录 |
| **响应** | `{ "id", "nickname", "avatar_url", "department", "email_verified", "created_at" }` |

#### `PUT /api/v1/users/me`

更新当前用户资料。

| 项目 | 说明 |
|------|------|
| **权限** | 需登录 |
| **请求体** | `{ "nickname": "string (可选)", "avatar_url": "string (可选)", "department": "string (可选)" }` |
| **响应** | `{ "user": { ... } }` |

#### `GET /api/v1/users/:id`

获取指定用户公开资料（用于展示发起人/成员信息）。

| 项目 | 说明 |
|------|------|
| **权限** | 需登录 |
| **响应** | `{ "id", "nickname", "avatar_url", "department" }` |

---

### 1.3 运动局模块（核心）

#### `POST /api/v1/games`

创建运动局。

| 项目 | 说明 |
|------|------|
| **权限** | 需登录 + 邮箱已验证 |
| **请求体** | `{ "sport_type": "string (必填, 枚举: basketball / badminton / running / fitness / soccer)", "title": "string (可选, 默认 '篮球局' 之类自动生成)", "location": "string (必填)", "max_players": "integer (必填, >= 3, 包含发起人)", "start_time": "string (必填, ISO 8601, 必须 > 当前时间)", "tag": "string (可选, 枚举: casual / beginner_friendly / competitive / relaxed)" }` |
| **响应** | `{ "game": { ... } }` |
| **状态约束** | 创建后状态为 `recruiting`；创建者自动成为发起人并加入成员列表 |

#### `GET /api/v1/games`

获取运动局列表（大厅）。

| 项目 | 说明 |
|------|------|
| **权限** | 需登录 |
| **查询参数** | `sport_type` (可选, 按运动类型筛选), `status` (可选, 默认只返回 recruiting/full), `page`, `page_size` (默认 20), `sort_by` (可选, 默认 `start_time`) |
| **响应** | `{ "games": [...], "pagination": {...} }` |
| **业务规则** | 只返回状态为 `recruiting` / `full` 的局；满员局排在非满员局后面；按 `start_time` 升序（最近即将开始的排前面） |

#### `GET /api/v1/games/:id`

获取运动局详情。

| 项目 | 说明 |
|------|------|
| **权限** | 需登录 |
| **响应** | `{ "game": { ...全量字段 }, "members": [ { "user_id", "nickname", "avatar_url" } ], "is_member": bool, "is_host": bool }` |

#### `POST /api/v1/games/:id/join`

加入运动局。

| 项目 | 说明 |
|------|------|
| **权限** | 需登录 + 邮箱已验证 |
| **请求体** | 无 |
| **响应** | `{ "game": { ... }, "member_count": int }` |
| **状态约束** | 仅当 `status IN (recruiting, full)` 时可加入；人数已满时拒绝 (409 Conflict) |
| **并发控制** | 数据库行锁或乐观锁，防止超员 |
| **副作用** | 若加入后满员 → 状态变 `full`；推送通知给发起人 |

#### `POST /api/v1/games/:id/leave`

退出运动局。

| 项目 | 说明 |
|------|------|
| **权限** | 需登录 |
| **请求体** | 无 |
| **响应** | `{ "game": { ... }, "member_count": int }` |
| **状态约束** | 仅当 `status IN (recruiting, full, ready)` 时可退出；发起人不可退出（应先取消局） |
| **副作用** | `full` → `recruiting`（回退）；`ready` → `recruiting`（即将开始回退规则）；若成员数为 0 保持 `recruiting`；推送通知给发起人 |

#### `POST /api/v1/games/:id/cancel`

取消运动局（仅发起人）。

| 项目 | 说明 |
|------|------|
| **权限** | 需登录，仅发起人 |
| **请求体** | 无 |
| **响应** | `{ "game": { ... } }` |
| **状态约束** | 仅当 `status IN (recruiting, full, ready)` 时可取消；`in_progress` 状态不可取消 |
| **副作用** | 状态 → `cancelled`；推送通知给所有已加入成员 |

#### `POST /api/v1/games/:id/complete`

确认运动结束（仅发起人）。

| 项目 | 说明 |
|------|------|
| **权限** | 需登录，仅发起人 |
| **请求体** | 无 |
| **响应** | `{ "game": { ... } }` |
| **状态约束** | 仅当 `status == in_progress` 时可结束 |
| **副作用** | 状态 → `completed`；记录 `completed_at` 时间戳 |

---

### 1.4 聊天模块

#### `GET /api/v1/games/:id/messages`

获取聊天消息列表。

| 项目 | 说明 |
|------|------|
| **权限** | 需登录 + 是该局成员（或是发起人） |
| **查询参数** | `before_id` (可选, 游标翻页, 取此 ID 之前的消息), `limit` (默认 50) |
| **响应** | `{ "messages": [ { "id", "sender_id", "sender_nickname", "sender_avatar_url", "content", "created_at" } ] }` |
| **业务规则** | `archived` 状态返回 403；`completed` 状态只读（不允许发消息但可读取） |

#### `POST /api/v1/games/:id/messages`

发送聊天消息。

| 项目 | 说明 |
|------|------|
| **权限** | 需登录 + 是该局成员 |
| **请求体** | `{ "content": "string (必填, 1-500字符)" }` |
| **响应** | `{ "message": { ... } }` |
| **状态约束** | 仅当 `status IN (recruiting, full, ready, in_progress)` 时可发送；`completed` / `archived` / `cancelled` 返回 403 |

---

### 1.5 通知模块

#### `GET /api/v1/notifications`

获取当前用户的通知列表。

| 项目 | 说明 |
|------|------|
| **权限** | 需登录 |
| **查询参数** | `page`, `page_size` (默认 20) |
| **响应** | `{ "notifications": [...], "unread_count": int, "pagination": {...} }` |

#### `PUT /api/v1/notifications/:id/read`

标记单条通知为已读。

| 项目 | 说明 |
|------|------|
| **权限** | 需登录 |
| **响应** | `{ "ok": true }` |

#### `PUT /api/v1/notifications/read-all`

全部标记为已读。

| 项目 | 说明 |
|------|------|
| **权限** | 需登录 |
| **响应** | `{ "ok": true }` |

---

### 1.6 API 端点汇总

```
POST   /api/v1/auth/register          用户注册
POST   /api/v1/auth/login             用户登录
POST   /api/v1/auth/verify-email      验证校园邮箱
POST   /api/v1/auth/refresh-token     刷新 Token

GET    /api/v1/users/me               获取当前用户
PUT    /api/v1/users/me               更新当前用户
GET    /api/v1/users/:id              获取用户公开资料

POST   /api/v1/games                   创建运动局
GET    /api/v1/games                   运动局列表（大厅）
GET    /api/v1/games/:id               运动局详情
POST   /api/v1/games/:id/join          加入运动局
POST   /api/v1/games/:id/leave         退出运动局
POST   /api/v1/games/:id/cancel        取消运动局（发起人）
POST   /api/v1/games/:id/complete      确认结束（发起人）

GET    /api/v1/games/:id/messages      获取聊天消息
POST   /api/v1/games/:id/messages      发送聊天消息

GET    /api/v1/notifications           获取通知列表
PUT    /api/v1/notifications/:id/read  标记已读
PUT    /api/v1/notifications/read-all  全部已读
```

---

## 2. 数据模型

### 2.1 ER 图

```
┌──────────────────┐       ┌──────────────────────────────┐
│      users       │       │            games             │
├──────────────────┤       ├──────────────────────────────┤
│ id (PK)          │──┐    │ id (PK)                      │
│ nickname         │  │    │ host_id (FK → users.id)      │◄──┐
│ email            │  │    │ sport_type                   │   │
│ password_hash    │  │    │ title                        │   │
│ avatar_url       │  │    │ location                     │   │
│ department       │  │    │ max_players                  │   │
│ student_id       │  │    │ start_time                   │   │
│ email_verified   │  │    │ end_time                     │   │
│ created_at       │  │    │ completed_at                 │   │
│ updated_at       │  │    │ status                       │   │
└──────────────────┘  │    │ tag                          │   │
                      │    │ member_count (冗余计数器)      │   │
                      │    │ created_at                    │   │
                      │    │ updated_at                    │   │
                      │    └──────────────────────────────┘   │
                      │                                        │
                      │    ┌──────────────────────────────┐   │
                      │    │        game_members           │   │
                      │    ├──────────────────────────────┤   │
                      ├────│ user_id (FK → users.id)      │   │
                      │    │ game_id (FK → games.id)      │───┘
                      │    │ joined_at                     │
                      │    │ left_at (NULL=still member)   │
                      │    └──────────────────────────────┘
                      │
                      │    ┌──────────────────────────────┐
                      │    │       chat_messages           │
                      │    ├──────────────────────────────┤
                      ├────│ id (PK)                       │
                      │    │ game_id (FK → games.id)       │
                      │    │ sender_id (FK → users.id)     │
                      │    │ content                       │
                      │    │ created_at                    │
                      │    └──────────────────────────────┘
                      │
                      │    ┌──────────────────────────────┐
                      │    │       notifications           │
                      │    ├──────────────────────────────┤
                      └────│ id (PK)                       │
                           │ user_id (FK → users.id)      │
                           │ type                          │
                           │ title                         │
                           │ content                       │
                           │ game_id (FK → games.id, NULL) │
                           │ is_read                       │
                           │ created_at                    │
                           └──────────────────────────────┘
```

### 2.2 表结构

#### `users` — 用户表

```sql
CREATE TABLE users (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nickname      VARCHAR(20)    NOT NULL COMMENT '昵称',
  email         VARCHAR(255)   NOT NULL COMMENT '校园邮箱',
  password_hash VARCHAR(255)   NOT NULL COMMENT 'bcrypt 哈希',
  avatar_url    VARCHAR(500)   NOT NULL DEFAULT '' COMMENT '头像 URL，空则前端生成默认头像',
  department    VARCHAR(100)   NOT NULL DEFAULT '' COMMENT '院系，可选',
  student_id    VARCHAR(50)    NOT NULL COMMENT '学号，不对外展示',
  email_verified BOOLEAN       NOT NULL DEFAULT FALSE COMMENT '邮箱是否已验证',
  created_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE INDEX idx_email (email),
  UNIQUE INDEX idx_student_id (student_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### `games` — 运动局表（核心）

```sql
CREATE TABLE games (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  host_id       BIGINT UNSIGNED NOT NULL COMMENT '发起人 ID',
  sport_type    ENUM('basketball', 'badminton', 'running', 'fitness', 'soccer')
                               NOT NULL COMMENT '运动类型',
  title         VARCHAR(50)    NOT NULL DEFAULT '' COMMENT '标题，空则由前端按 '[运动] [人数]' 自动生成',
  location      VARCHAR(200)   NOT NULL COMMENT '地点',
  max_players   TINYINT UNSIGNED NOT NULL COMMENT '最大人数（含发起人）',
  start_time    DATETIME       NOT NULL COMMENT '预计开始时间',
  end_time      DATETIME       NULL DEFAULT NULL COMMENT '预计/实际结束时间',
  completed_at  DATETIME       NULL DEFAULT NULL COMMENT '实际结束确认时间',
  status        ENUM('recruiting', 'full', 'ready', 'in_progress', 'completed', 'archived', 'cancelled')
                               NOT NULL DEFAULT 'recruiting' COMMENT '运动局状态',
  tag           ENUM('casual', 'beginner_friendly', 'competitive', 'relaxed')
                               NULL DEFAULT NULL COMMENT '局标签',
  member_count  TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '当前成员数（冗余，防并发读）',
  created_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_host (host_id),
  INDEX idx_status (status),
  INDEX idx_sport_type (sport_type),
  INDEX idx_start_time (start_time),
  INDEX idx_lobby (status, start_time) COMMENT '大厅列表查询：先按状态过滤再按时间排序',
  INDEX idx_auto_task (status, start_time) COMMENT '定时任务：扫描需要状态变更的局',

  CONSTRAINT fk_games_host FOREIGN KEY (host_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**`status` 枚举值说明**：

| 值 | 含义 | 可加入 | 大厅展示 | 聊天可用 |
|------|------|:---:|:---:|:---:|
| `recruiting` | 招募中 | 是 | 是 | 是 |
| `full` | 已满员 | 否 | 是（排序靠后） | 是 |
| `ready` | 即将开始（距开始 <= 30分钟） | 否 | 否 | 是 |
| `in_progress` | 进行中 | 否 | 否 | 是 |
| `completed` | 已结束 | 否 | 否 | 只读 |
| `archived` | 已归档（结束 24 小时后） | 否 | 否 | 关闭 |
| `cancelled` | 已取消 | 否 | 否 | 关闭 |

#### `game_members` — 局成员关系表

```sql
CREATE TABLE game_members (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  game_id       BIGINT UNSIGNED NOT NULL COMMENT '运动局 ID',
  user_id       BIGINT UNSIGNED NOT NULL COMMENT '用户 ID',
  joined_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
  left_at       DATETIME       NULL DEFAULT NULL COMMENT '退出时间，NULL 表示仍在局中',

  UNIQUE INDEX idx_game_user_active (game_id, user_id) COMMENT '同一用户对同一局只能有一条活跃记录',
  INDEX idx_user_joined (user_id, joined_at) COMMENT '查询用户参与的局',
  INDEX idx_game_active (game_id, left_at) COMMENT '查询局内活跃成员',

  CONSTRAINT fk_members_game FOREIGN KEY (game_id) REFERENCES games(id),
  CONSTRAINT fk_members_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**注意**：对于退出再重新加入的场景，MV

P 阶段建议**软删除（记录 `left_at`）**而非物理删除，便于后续数据分析和审计。或者简化为物理删除 + 保留历史记录表（MVP 可暂不实现）。

#### `chat_messages` — 聊天消息表

```sql
CREATE TABLE chat_messages (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  game_id       BIGINT UNSIGNED NOT NULL COMMENT '所属运动局 ID',
  sender_id     BIGINT UNSIGNED NOT NULL COMMENT '发送者 ID',
  content       VARCHAR(500)   NOT NULL COMMENT '消息内容（纯文本）',
  created_at    DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '发送时间（毫秒精度，用于排序）',

  INDEX idx_game_time (game_id, created_at) COMMENT '按局拉取消息，时间排序',
  INDEX idx_sender (sender_id),

  CONSTRAINT fk_chat_game FOREIGN KEY (game_id) REFERENCES games(id),
  CONSTRAINT fk_chat_sender FOREIGN KEY (sender_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### `notifications` — 通知表

```sql
CREATE TABLE notifications (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT UNSIGNED NOT NULL COMMENT '接收者用户 ID',
  type          ENUM('member_joined', 'game_ready', 'new_message', 'game_cancelled', 'member_left')
                               NOT NULL COMMENT '通知类型',
  title         VARCHAR(100)   NOT NULL COMMENT '通知标题',
  content       VARCHAR(300)   NOT NULL COMMENT '通知内容',
  game_id       BIGINT UNSIGNED NULL DEFAULT NULL COMMENT '关联运动局 ID',
  is_read       BOOLEAN        NOT NULL DEFAULT FALSE COMMENT '是否已读',
  created_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_user_unread (user_id, is_read, created_at) COMMENT '拉取用户未读通知列表',
  INDEX idx_created_at (created_at),

  CONSTRAINT fk_notify_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_notify_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**`type` 枚举说明**：

| 值 | 触发场景 | 接收人 |
|------|---------|--------|
| `member_joined` | 有人加入 | 发起人 |
| `game_ready` | 局即将开始 | 所有参与者 |
| `new_message` | 局内新消息 | 所有参与者（发消息者除外） |
| `game_cancelled` | 局被取消 | 所有参与者 |
| `member_left` | 有人退出（满员回退场景） | 发起人 |

---

## 3. 状态机实现方案

### 3.1 状态定义与流转图

```
                        ┌──────────────┐
                        │  创建运动局    │
                        └──────┬───────┘
                               │ status = recruiting, member_count = 1
                               ▼
                     ┌──────────────────┐
                     │    RECRUITING    │
                     │    （招募中）      │◄──────────────────────────┐
                     └───┬──────┬───┬───┘                           │
                         │      │   │                               │
              成员加入后   │      │   │ 发起人取消                     │
              满员         │      │   │                               │
                         ▼      │   │                               │
                  ┌──────────┐  │   │                               │
                  │   FULL   │  │   │  成员退出                       │
                  │ （已满员） │──┼───┘  (不满 → recruiting)           │
                  └────┬─────┘  │                                   │
                       │        │                                   │
          距开始30分钟  │        │ 距开始30分钟                        │
                       │        │ (有成员)                            │
                       ▼        ▼                                   │
                  ┌──────────────────┐                               │
                  │      READY      │                               │
                  │   （即将开始）    │─── 成员退出 ──────────────────┘
                  └───┬──────┬─────┘    (回退 recruiting)
                      │      │
          到达开始时间  │      │ 发起人取消
                      ▼      │
               ┌─────────────┐│
               │ IN_PROGRESS ││
               │  （进行中）   ││
               └──┬──────────┘│
                  │           │
    发起人确认结束 │           ▼
    / 超时自动     │    ┌──────────────┐
                  ▼    │   CANCELLED  │
            ┌──────────┐│  （已取消）    │
            │ COMPLETED │└──────────────┘
            │ （已结束）  │    (终态)
            └─────┬─────┘
                  │ 24 小时后
                  ▼
            ┌──────────────┐
            │   ARCHIVED   │
            │  （已归档）    │
            │   (终态)      │
            └──────────────┘

自动超时取消（定时任务处理）：
  recruiting / full / ready ──[start_time + 30分钟 仍无人确认开始]──→ cancelled
```

### 3.2 状态变更触发条件与校验逻辑

所有状态变更必须在**数据库事务**内完成，确保原子性。

```python
# 伪代码：状态变更核心逻辑

# ----------------------------------------------------------------
# 1. 加入 → 可能触发 recruiting → full
# ----------------------------------------------------------------
def join_game(game_id, user_id):
    with db.transaction():
        game = db.execute(
            "SELECT * FROM games WHERE id = ? FOR UPDATE", game_id
        )

        # 前置校验
        if game.status not in ('recruiting', 'full'):
            raise StateError("当前状态不允许加入")
        if game.member_count >= game.max_players:
            raise StateError("该局已满员")

        # 检查用户是否已在局中
        existing = db.exists("game_members",
            game_id=game_id, user_id=user_id, left_at=None)
        if existing:
            raise StateError("你已在该局中")

        # 写入成员记录
        db.insert("game_members",
            game_id=game_id, user_id=user_id, joined_at=now())

        # 更新计数 + 状态
        new_count = game.member_count + 1
        new_status = 'full' if new_count >= game.max_players else game.status
        db.execute(
            "UPDATE games SET member_count = ?, status = ?, updated_at = ? WHERE id = ?",
            new_count, new_status, now(), game_id
        )

    # 事务外：发通知
    notify_host(game.host_id, 'member_joined', user_id, game)


# ----------------------------------------------------------------
# 2. 退出 → 可能触发 full → recruiting 或 ready → recruiting
# ----------------------------------------------------------------
def leave_game(game_id, user_id):
    with db.transaction():
        game = db.execute(
            "SELECT * FROM games WHERE id = ? FOR UPDATE", game_id
        )

        # 前置校验
        if game.status not in ('recruiting', 'full', 'ready'):
            raise StateError("当前状态不允许退出")
        if game.host_id == user_id:
            raise StateError("发起人不能退出，请取消该局")

        # 检查是否在局中
        member = db.find_one("game_members",
            game_id=game_id, user_id=user_id, left_at=None)
        if not member:
            raise StateError("你不在该局中")

        # 标记退出
        db.execute(
            "UPDATE game_members SET left_at = ? WHERE id = ?",
            now(), member.id
        )

        # 更新计数 + 状态
        new_count = game.member_count - 1
        new_status = _leave_status(game.status, new_count, game.max_players)
        db.execute(
            "UPDATE games SET member_count = ?, status = ?, updated_at = ? WHERE id = ?",
            new_count, new_status, now(), game_id
        )

    # 事务外：发通知
    if game.status == 'full':
        notify_host(game.host_id, 'member_left', user_id, game)

def _leave_status(current_status, new_count, max_players):
    """退出后的状态判定"""
    # full → recruiting：满员变不满
    if current_status == 'full' and new_count < max_players:
        return 'recruiting'
    # ready → recruiting：即将开始回退（PRD 3.3 规则）
    if current_status == 'ready':
        return 'recruiting'
    return current_status


# ----------------------------------------------------------------
# 3. 取消 → recruiting/full/ready → cancelled
# ----------------------------------------------------------------
def cancel_game(game_id, user_id):
    with db.transaction():
        game = db.execute("SELECT * FROM games WHERE id = ? FOR UPDATE", game_id)
        if game.host_id != user_id:
            raise PermissionError("仅发起人可取消")
        if game.status not in ('recruiting', 'full', 'ready'):
            raise StateError("当前状态不允许取消")
        if game.status == 'in_progress':
            raise StateError("已开始的局不可取消")

        db.execute(
            "UPDATE games SET status = 'cancelled', updated_at = ? WHERE id = ?",
            now(), game_id
        )

    # 通知所有成员
    members = db.find_all("game_members", game_id=game_id, left_at=None)
    for m in members:
        if m.user_id != user_id:
            notify(m.user_id, 'game_cancelled', game)


# ----------------------------------------------------------------
# 4. 确认结束 → in_progress → completed
# ----------------------------------------------------------------
def complete_game(game_id, user_id):
    with db.transaction():
        game = db.execute("SELECT * FROM games WHERE id = ? FOR UPDATE", game_id)
        if game.host_id != user_id:
            raise PermissionError("仅发起人可确认结束")
        if game.status != 'in_progress':
            raise StateError("只能结束进行中的局")

        db.execute(
            "UPDATE games SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?",
            now(), now(), game_id
        )
```

### 3.3 定时任务设计

使用 Cron Job 或任务调度器（如 APScheduler、Celery Beat）执行。

```
┌──────────────────────────┬──────────────┬──────────────────────────────────────────────┐
│ 任务名称                  │ 执行频率      │ 逻辑                                         │
├──────────────────────────┼──────────────┼──────────────────────────────────────────────┤
│ check_game_ready         │ 每分钟        │ 扫描 status=recruiting/full                  │
│                          │              │ AND start_time <= NOW() + 30min               │
│                          │              │ AND start_time > NOW()                        │
│                          │              │ → status = 'ready'; 通知所有参与者              │
├──────────────────────────┼──────────────┼──────────────────────────────────────────────┤
│ start_in_progress        │ 每分钟        │ 扫描 status=ready                             │
│                          │              │ AND start_time <= NOW()                        │
│                          │              │ → status = 'in_progress'                       │
├──────────────────────────┼──────────────┼──────────────────────────────────────────────┤
│ auto_cancel_expired      │ 每分钟        │ 扫描 status IN (recruiting, full, ready)       │
│                          │              │ AND start_time + 30min <= NOW()                │
│                          │              │ → status = 'cancelled'; 通知发起人和成员         │
├──────────────────────────┼──────────────┼──────────────────────────────────────────────┤
│ auto_complete            │ 每 5 分钟     │ 扫描 status=in_progress                        │
│                          │              │ AND start_time + 3h <= NOW()                   │
│                          │              │ (3 小时超时自动结束)                            │
│                          │              │ → status = 'completed'; completed_at = NOW()    │
├──────────────────────────┼──────────────┼──────────────────────────────────────────────┤
│ archive_completed        │ 每小时        │ 扫描 status=completed                          │
│                          │              │ AND completed_at + 24h <= NOW()                │
│                          │              │ → status = 'archived'                          │
└──────────────────────────┴──────────────┴──────────────────────────────────────────────┘
```

**实现示例（SQL 批量更新）**：

```sql
-- check_game_ready（每分钟执行）
UPDATE games
SET status = 'ready', updated_at = NOW()
WHERE status IN ('recruiting', 'full')
  AND start_time <= DATE_ADD(NOW(), INTERVAL 30 MINUTE)
  AND start_time > NOW();

-- auto_cancel_expired（每分钟执行）
UPDATE games
SET status = 'cancelled', updated_at = NOW()
WHERE status IN ('recruiting', 'full', 'ready')
  AND DATE_ADD(start_time, INTERVAL 30 MINUTE) <= NOW();
```

### 3.4 并发控制

#### 问题场景：最后一个名额多人同时加入

假设 `max_players = 5`，当前 `member_count = 4`，A 和 B 同时请求加入。

**方案：SELECT ... FOR UPDATE 悲观锁（推荐 MVP）**

```sql
BEGIN;

-- 行级锁，阻塞并发事务
SELECT id, status, member_count, max_players
FROM games
WHERE id = ? FOR UPDATE;

-- 应用层校验 member_count < max_players
-- 校验通过后：
INSERT INTO game_members (game_id, user_id, joined_at) VALUES (?, ?, NOW());

UPDATE games
SET member_count = member_count + 1,
    status = IF(member_count + 1 >= max_players, 'full', status),
    updated_at = NOW()
WHERE id = ?;

COMMIT;
```

**关键点**：
- `FOR UPDATE` 确保同一时刻只有一个事务能获取该行的写锁
- 必须在事务内完成 SELECT + 校验 + UPDATE
- MySQL/PostgreSQL 均支持，无需额外中间件
- 事务持有时间极短（< 10ms），不会成为性能瓶颈

**备选方案：乐观锁（适用于低冲突场景）**

```sql
-- 使用 version 字段
UPDATE games
SET member_count = member_count + 1,
    status = IF(member_count + 1 >= max_players, 'full', status),
    version = version + 1
WHERE id = ? AND version = ? AND member_count < max_players;

-- 如果 affected_rows = 0 → 并发冲突，重试或返回失败
```

MVP 阶段**推荐悲观锁**，逻辑简单清晰，不易出错。

---

## 4. 通知系统设计

### 4.1 触发时机（与状态机联动）

```
┌─────────────────────┬─────────────────┬──────────────────┬───────────────────────────────┐
│ 触发场景             │ 状态变更点        │ 接收人             │ 推送内容                        │
├─────────────────────┼─────────────────┼──────────────────┼───────────────────────────────┤
│ 有人加入             │ join 成功后       │ 发起人             │ "{nickname} 加入了你的{sport}局" │
│ 局即将开始           │ 定时任务           │ 所有参与者          │ "你加入的 {sport}局 30 分钟后开始"  │
│                     │ recruiting→ready │                   │                               │
│ 局内有新消息          │ send_message 后  │ 局内其他人          │ "{nickname}: {消息截断}"          │
│ 局被取消（发起人）     │ cancel 成功后     │ 所有已加入成员       │ "你加入的 {sport}局 已被发起人取消"  │
│ 局被取消（超时）       │ 定时任务          │ 发起人+所有成员      │ "你加入的 {sport}局 因超时未开始已自动取消" │
│                     │ → cancelled      │                   │                               │
│ 有人退出（满员回退）   │ leave 成功 +      │ 发起人             │ "{nickname} 退出了，局已重新展示在首页" │
│                     │ full→recruiting  │                   │                               │
└─────────────────────┴─────────────────┴──────────────────┴───────────────────────────────┘
```

### 4.2 存储结构

通知存储在 `notifications` 表中（见 2.2 节）。MVP 阶段不做推送聚合（如"3 人加入你的局"合并为一条），每条事件独立存储。

**消息内容模板**：

```python
NOTIFICATION_TEMPLATES = {
    'member_joined': {
        'title':   '新成员加入',
        'content': '{joiner_nickname} 加入了你的「{game_title}」'
    },
    'game_ready': {
        'title':   '局即将开始',
        'content': '你加入的「{game_title}」将在 30 分钟后开始，记得准时参加！'
    },
    'new_message': {
        'title':   '新消息',
        'content': '{sender_nickname}：{content_preview}'  # 截断到 50 字符
    },
    'game_cancelled': {
        'title':   '局已取消',
        'content': '你加入的「{game_title}」已被取消'
    },
    'member_left': {
        'title':   '成员退出',
        'content': '{leaver_nickname} 退出了「{game_title}」，该局已重新展示在大厅'
    },
}
```

### 4.3 推送通道选择（MVP 建议）

MVP 阶段只做 **App 内通知**，不做 Push（APNs/FCM）和短信。

| 通道 | MVP | 说明 |
|------|:---:|------|
| **App 内通知**（轮询 + 红点） | **必须** | 前端每 15-30 秒轮询 `GET /api/v1/notifications` 获取未读数；大厅/聊天入口展示红点 |
| **WebSocket 实时推送** | **建议** | 聊天消息和关键通知通过 WebSocket 实时下发，减少轮询压力，提升实时体验 |
| APNs / FCM 离线推送 | 暂不做 | 比赛阶段 App 打开率足够，无需离线 Push；后续用户留存稳定后再接入 |
| 短信 | 不做 | 成本高，校园场景不需要 |
| 邮件 | 不做 | 已有校园邮箱验证，不再额外使用邮件通知 |

**WebSocket 方案（推荐）**：

```
客户端 ──ws://──▶ 服务端 (连接时携带 JWT Token)
                      │
                      ├── 加入局聊天室频道: game:{game_id}
                      ├── 个人通知频道:     user:{user_id}
                      │
                      ▼
              Redis Pub/Sub 广播
```

事件类型：
- `chat.message` — 新聊天消息
- `notification.new` — 新通知（含未读数）

**轮询降级（WebSocket 不可用时）**：

前端每 20 秒调用 `GET /api/v1/notifications?page=1&page_size=1` 检查 `unread_count`，有变化时更新红点。

---

## 附录

### A. 错误码设计

```
20001  邮箱未验证，无法执行此操作
20002  该局已满员
20003  当前状态不允许此操作
20004  发起人不能退出自己的局
20005  已开始的局不可取消
20006  只能结束进行中的局
20007  你已在该局中
20008  你不在该局中
20009  聊天室已关闭
20010  用户认证失败
```

### B. MVP 技术栈建议

| 层 | 推荐 | 说明 |
|------|------|------|
| 前端 | React 18 + TypeScript + Vite | 移动端优先响应式，Zustand 状态管理 |
| 后端语言 | Node.js + Express + TypeScript | 全栈 TypeScript，生态成熟 |
| 数据库 | MySQL 8.0+ 或 PostgreSQL 15 | 成熟稳定，事务支持好 |
| 缓存 | Redis | WebSocket Pub/Sub + 热点数据缓存 |
| 任务调度 | node-cron | 定时状态变更，进程内轻量 |
| WebSocket | Socket.IO | 自动降级，房间管理 |

### C. 命名规范

- **表名**: 复数 `snake_case`（`users`, `games`, `game_members`, `chat_messages`, `notifications`）
- **字段名**: `snake_case`（`host_id`, `start_time`, `member_count`）
- **枚举值**: `snake_case` 字符串（`'recruiting'`, `'in_progress'`, `'game_ready'`）
- **API 路径**: 复数资源名 + `kebab-case` 无动词（`/api/v1/games/:id/join`）
- **外键**: `{referenced_table_singular}_id`（`host_id`, `sender_id`, `game_id`）
