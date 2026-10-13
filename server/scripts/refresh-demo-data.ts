import bcrypt from 'bcrypt';
import { initSQLite, sqliteQuery } from '../src/db/sqlite-adapter';

type UserRow = {
  id: number;
  nickname: string;
  email: string;
};

type GameRow = {
  id: number;
  host_id: number;
  max_players: number;
  status: string;
};

const SALT_ROUNDS = 10;
const DEMO_EMAIL_DOMAIN = '@dajju.local';
const LEVEL_THRESHOLDS = [0, 5, 12, 24, 40, 60, 90];
const SPORTS = [
  { key: 'basketball', name: '篮球', places: ['前卫校区北苑篮球场', '中心体育馆篮球馆', '南岭体育馆篮球馆'] },
  { key: 'badminton', name: '羽毛球', places: ['中心体育馆羽毛球馆', '南岭体育馆羽毛球馆', '朝阳体育馆羽毛球馆'] },
  { key: 'running', name: '跑步', places: ['前卫校区田径场', '南岭校区田径场', '朝阳校区田径场'] },
  { key: 'fitness', name: '健身', places: ['宋治平体育馆健身馆', '日新楼健身中心', '鼎新楼健身中心'] },
  { key: 'table_tennis', name: '乒乓球', places: ['宋治平体育馆乒乓球馆', '中心体育馆乒乓球馆', '朝阳体育馆乒乓球馆'] },
  { key: 'volleyball', name: '排球', places: ['前卫校区北苑排球场', '南岭校区排球场', '朝阳校区排球场'] },
];

const CAMPUSES = [
  { id: 1, name: '前卫校区（中心校区）' },
  { id: 2, name: '南岭校区' },
  { id: 3, name: '朝阳校区（地质宫校区）' },
];

const DEPARTMENTS = ['软件学院', '计算机科学与技术学院', '机械学院', '通信工程学院', '商学与管理学院', '法学院'];
const SURNAMES = ['陈', '林', '周', '赵', '许', '孙', '吴', '郑', '王', '李', '刘', '杨', '黄', '郭', '何'];
const GIVEN_NAMES = ['安宁', '知远', '嘉禾', '子谦', '可欣', '若曦', '沐辰', '书瑶', '景行', '奕辰', '思源', '语桐', '星野', '一凡', '清妍'];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sampleOne<T>(items: T[]): T {
  return items[randomInt(0, items.length - 1)];
}

function shuffle<T>(items: T[]): T[] {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function uniqueNames(count: number): string[] {
  const names = new Set<string>();
  while (names.size < count) {
    names.add(`${sampleOne(SURNAMES)}${sampleOne(GIVEN_NAMES)}`);
  }
  return [...names];
}

function getRewardLevel(points: number): number {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i += 1) {
    if (points >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
    }
  }
  return level;
}

function isGarbledNickname(nickname: string): boolean {
  const trimmed = String(nickname || '').trim();
  if (!trimmed) return true;
  if (trimmed.includes('\uFFFD') || trimmed.includes('�')) return true;
  return /^[^\p{Script=Han}A-Za-z0-9]+$/u.test(trimmed);
}

function cleanupUsers(userIds: number[]) {
  if (userIds.length === 0) return;

  const placeholders = userIds.map(() => '?').join(', ');
  const hostedGames = sqliteQuery(
    `SELECT id FROM games WHERE host_id IN (${placeholders})`,
    userIds,
  ).rows.map((row: any) => Number(row.id));

  if (hostedGames.length > 0) {
    const gamePlaceholders = hostedGames.map(() => '?').join(', ');
    sqliteQuery(`DELETE FROM game_members WHERE game_id IN (${gamePlaceholders})`, hostedGames);
    sqliteQuery(`DELETE FROM chat_messages WHERE game_id IN (${gamePlaceholders})`, hostedGames);
    sqliteQuery(`DELETE FROM notifications WHERE game_id IN (${gamePlaceholders})`, hostedGames);
    sqliteQuery(`DELETE FROM games WHERE id IN (${gamePlaceholders})`, hostedGames);
  }

  sqliteQuery(`DELETE FROM game_members WHERE user_id IN (${placeholders})`, userIds);
  sqliteQuery(`DELETE FROM chat_messages WHERE sender_id IN (${placeholders})`, userIds);
  sqliteQuery(`DELETE FROM notifications WHERE user_id IN (${placeholders})`, userIds);
  sqliteQuery(`DELETE FROM users WHERE id IN (${placeholders})`, userIds);
}

function refreshMemberCounts() {
  const games = sqliteQuery(
    `SELECT id, max_players, status
     FROM games
     ORDER BY id`,
  ).rows as GameRow[];

  for (const game of games) {
    const countResult = sqliteQuery(
      `SELECT COUNT(*) AS total
       FROM game_members
       WHERE game_id = ? AND left_at IS NULL`,
      [game.id],
    );
    const memberCount = Number(countResult.rows[0]?.total ?? 0);
    let nextStatus = game.status;
    if (game.status === 'recruiting' || game.status === 'full') {
      nextStatus = memberCount >= Number(game.max_players) ? 'full' : 'recruiting';
    }
    sqliteQuery(
      `UPDATE games
       SET member_count = ?, status = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [memberCount, nextStatus, game.id],
    );
  }
}

async function createDemoUsers(count: number): Promise<number[]> {
  const names = uniqueNames(count);
  const passwordHash = await bcrypt.hash('123456', SALT_ROUNDS);
  const ids: number[] = [];

  names.forEach((nickname, index) => {
    const points = randomInt(0, 80);
    const rewardLevel = getRewardLevel(points);
    const rewardStreak = randomInt(0, 5);
    const completedGames = randomInt(0, 8);
    const hostedCompletedGames = randomInt(0, Math.min(4, completedGames));
    const campus = sampleOne(CAMPUSES);
    const department = sampleOne(DEPARTMENTS);
    const insertResult = sqliteQuery(
      `INSERT INTO users (
         nickname, email, password_hash, student_id, email_verified,
         school_id, campus_id, department, reward_points, reward_level,
         reward_streak, completed_games, hosted_completed_games,
         reward_badges, last_rewarded_date
       )
       VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?, ?, ?, '[]', date('now'))`,
      [
        nickname,
        `demo.seed.${Date.now()}.${index}${DEMO_EMAIL_DOMAIN}`,
        passwordHash,
        `demo-${Date.now()}-${index}`,
        campus.id,
        department,
        points,
        rewardLevel,
        rewardStreak,
        completedGames,
        hostedCompletedGames,
      ],
    );
    ids.push(Number(insertResult.rows[0]?.id));
  });

  return ids;
}

function assignRandomPointsToExistingUsers(skipEmails: string[]) {
  const users = sqliteQuery(
    `SELECT id, email
     FROM users
     ORDER BY id`,
  ).rows as Array<{ id: number; email: string }>;

  for (const user of users) {
    if (skipEmails.includes(user.email)) continue;
    const points = randomInt(0, 90);
    sqliteQuery(
      `UPDATE users
       SET reward_points = ?,
           reward_level = ?,
           reward_streak = ?,
           completed_games = ?,
           hosted_completed_games = ?,
           last_rewarded_date = date('now'),
           updated_at = datetime('now')
       WHERE id = ?`,
      [
        points,
        getRewardLevel(points),
        randomInt(0, 6),
        randomInt(0, 10),
        randomInt(0, 5),
        user.id,
      ],
    );
  }
}

function createDemoGames(hostIds: number[], participantIds: number[]) {
  const totalGames = Math.min(10, Math.max(6, hostIds.length));
  const shuffledHosts = shuffle(hostIds);

  for (let i = 0; i < totalGames; i += 1) {
    const hostId = shuffledHosts[i % shuffledHosts.length];
    const sport = sampleOne(SPORTS);
    const campus = sampleOne(CAMPUSES);
    const location = sampleOne(sport.places);
    const maxPlayers = randomInt(4, 8);
    const start = new Date();
    start.setHours(18 + (i % 3), i % 2 === 0 ? 0 : 30, 0, 0);
    start.setDate(start.getDate() + randomInt(0, 2));
    const end = new Date(start.getTime() + randomInt(90, 150) * 60 * 1000);
    const insertResult = sqliteQuery(
      `INSERT INTO games (
         host_id, sport_type, title, location, max_players,
         start_time, end_time, status, tag, member_count,
         school_id, campus_id, venue_name_snapshot, meeting_note
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, 'recruiting', 'casual', 1, 1, ?, ?, ?)`,
      [
        hostId,
        sport.key,
        `${sport.name}局`,
        location,
        maxPlayers,
        start.toISOString(),
        end.toISOString(),
        campus.id,
        location,
        `随便打打，来得早可以先热身。`,
      ],
    );
    const gameId = Number(insertResult.rows[0]?.id);
    sqliteQuery(
      `INSERT INTO game_members (game_id, user_id, joined_at)
       VALUES (?, ?, datetime('now'))`,
      [gameId, hostId],
    );

    const candidates = shuffle(participantIds.filter((userId) => userId !== hostId));
    const extraCount = Math.min(candidates.length, randomInt(1, Math.max(1, maxPlayers - 1)));
    for (let j = 0; j < extraCount; j += 1) {
      sqliteQuery(
        `INSERT INTO game_members (game_id, user_id, joined_at)
         VALUES (?, ?, datetime('now'))`,
        [gameId, candidates[j]],
      );
    }
  }

  refreshMemberCounts();
}

async function main() {
  await initSQLite();

  const beforeUsers = sqliteQuery(
    `SELECT id, nickname, email
     FROM users
     ORDER BY id`,
  ).rows as UserRow[];

  const garbledUsers = beforeUsers.filter((user) => isGarbledNickname(user.nickname));
  const oldDemoUsers = beforeUsers.filter((user) => user.email.endsWith(DEMO_EMAIL_DOMAIN));
  const cleanupIds = [...new Set([...garbledUsers, ...oldDemoUsers].map((user) => Number(user.id)))];

  cleanupUsers(cleanupIds);
  refreshMemberCounts();

  const createdDemoUserIds = await createDemoUsers(8);

  const remainingUsers = sqliteQuery(
    `SELECT id, nickname, email
     FROM users
     ORDER BY id`,
  ).rows as UserRow[];

  assignRandomPointsToExistingUsers([]);

  const participantIds = remainingUsers.map((user) => Number(user.id)).concat(createdDemoUserIds);
  createDemoGames(createdDemoUserIds, [...new Set(participantIds)]);

  const summary = {
    removed_garbled_users: garbledUsers.map((user) => ({ id: user.id, nickname: user.nickname, email: user.email })),
    removed_old_demo_users: oldDemoUsers.map((user) => ({ id: user.id, nickname: user.nickname, email: user.email })),
    total_users: sqliteQuery('SELECT COUNT(*) AS total FROM users').rows[0]?.total,
    total_games: sqliteQuery('SELECT COUNT(*) AS total FROM games').rows[0]?.total,
    leaderboard_preview: sqliteQuery(
      `SELECT nickname, reward_points, reward_level
       FROM users
       ORDER BY reward_points DESC, id ASC
       LIMIT 10`,
    ).rows,
    game_preview: sqliteQuery(
      `SELECT title, location, start_time, member_count, max_players
       FROM games
       ORDER BY id DESC
       LIMIT 8`,
    ).rows,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
