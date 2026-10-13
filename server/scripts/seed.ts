/**
 * 本地开发种子脚本
 * 验证用户邮箱 + 创建示例运动局
 */
import { initSQLite, sqliteQuery } from '../src/db/sqlite-adapter';

async function seed() {
  await initSQLite();

  // 验证用户邮箱
  sqliteQuery("UPDATE users SET email_verified = 1 WHERE id = 1");
  const users = sqliteQuery("SELECT id, nickname, email_verified FROM users");
  console.log("Users:", JSON.stringify(users.rows));

  // 创建示例局
  sqliteQuery(`INSERT INTO games (host_id, sport_type, location, max_players, start_time, status, tag, member_count)
    VALUES (1, 'basketball', '东操场', 5, datetime('now', '+2 hours'), 'recruiting', 'casual', 1)`);
  sqliteQuery(`INSERT INTO game_members (game_id, user_id) VALUES (1, 1)`);

  sqliteQuery(`INSERT INTO games (host_id, sport_type, location, max_players, start_time, status, tag, member_count)
    VALUES (1, 'badminton', '体育馆一楼', 4, datetime('now', '+3 hours'), 'recruiting', 'beginner_friendly', 1)`);
  sqliteQuery(`INSERT INTO game_members (game_id, user_id) VALUES (2, 1)`);

  const games = sqliteQuery("SELECT * FROM games");
  console.log("Games:", JSON.stringify(games.rows));
  console.log("Seed done!");
}

seed().catch(console.error);
