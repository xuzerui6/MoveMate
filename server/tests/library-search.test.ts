import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
Object.assign(process.env, {
  SQLITE_PATH: path.join(
    mkdtempSync(path.join(tmpdir(), "gym-search-test-")),
    "gym.db",
  ),
  JWT_SECRET: "search-test-secret".repeat(4),
  STUDENT_ID_SALT: "gym-test-salt".repeat(4),
  ENV_FILE: "absent",
  NODE_ENV: "test",
  SMTP_USER: "",
  SMTP_PASS: "",
});
const { pool } = require("../src/db");
const gym = require("../src/gym/service");
const { scoreExercise } = require("../src/gym/search");
let owner: number;
before(async () => {
  await pool.query("SELECT 1");
  const r = await pool.query(
    "INSERT INTO users(email,nickname,password_hash,email_verified,campus_id,student_id) VALUES($1,$1,$2,1,1,$1) RETURNING id",
    ["search-owner@dajju.local", "not-used"],
  );
  owner = r.rows[0].id;
});

const fake = (over: Record<string, any>) => ({
  id: "exdb:999999",
  name: "fake move",
  nameZh: "测试动作",
  bodyPart: "chest",
  target: "pectorals",
  secondaryMuscles: [],
  equipment: "dumbbell",
  instructions: ["步骤一"],
  category: "strength",
  ...over,
});

test("score: pinyin full and initials match the Chinese name", () => {
  const e = fake({ nameZh: "杠铃深蹲" });
  assert.ok(scoreExercise(e, "shendun", new Set()) > 0);
  assert.ok(scoreExercise(e, "ganglingshendun", new Set()) > 0);
  assert.ok(scoreExercise(e, "sd", new Set()) > 0);
  assert.equal(scoreExercise(e, "yingla", new Set()), 0);
});

test("score: synonyms expand colloquial names", () => {
  assert.ok(scoreExercise(fake({ nameZh: "站姿卷腹" }), "虐腹", new Set()) >= 58);
  assert.ok(
    scoreExercise(fake({ nameZh: "绳索高位下拉", equipment: "cable" }), "龙门架", new Set()) >= 58,
  );
  assert.equal(scoreExercise(fake({ nameZh: "站姿卷腹" }), "龙门架", new Set()), 0);
});

test("score: facet labels find exercises by body part", () => {
  const back = fake({ bodyPart: "back", target: "lats", nameZh: "某某划船" });
  assert.ok(scoreExercise(back, "练背", new Set()) >= 36);
  assert.ok(scoreExercise(back, "背阔肌", new Set()) >= 36);
  assert.equal(scoreExercise(back, "练胸", new Set()), 0);
  // 单字段匹配：不得把 target=back 与 equipment=lever 拼成 'back lever'
  const lever = fake({
    name: "other move",
    nameZh: "其他动作",
    bodyPart: "back",
    target: "back",
    equipment: "leverage machine",
  });
  assert.equal(scoreExercise(lever, "back lever", new Set()), 0);
});

test("score: media and favorite boosts break ties only upward", () => {
  const withMedia = fake({ id: "exdb:1760", nameZh: "测试深蹲" });
  const plain = fake({ id: "exdb:999998", nameZh: "测试深蹲" });
  const favs = new Set<string>();
  assert.ok(scoreExercise(withMedia, "测试深蹲", favs) > scoreExercise(plain, "测试深蹲", favs));
  favs.add("exdb:999998");
  assert.ok(scoreExercise(plain, "测试深蹲", favs) > scoreExercise(plain, "测试深蹲", new Set()));
});

test("library: pinyin search returns squats first", async () => {
  const full = await gym.library(owner, { q: "shendun" });
  assert.ok(full.total > 10);
  assert.ok(full.items[0].nameZh.includes("深蹲"));
  const initials = await gym.library(owner, { q: "sd" });
  assert.ok(initials.total > 5);
  assert.ok(initials.items[0].nameZh.includes("蹲"));
  assert.ok(initials.items.some((e: any) => e.nameZh.includes("深蹲")));
  const pinyinPush = await gym.library(owner, { q: "wotui" });
  assert.ok(pinyinPush.items[0].nameZh.includes("卧推"));
});

test("library: colloquial and body-part queries work", async () => {
  const abs = await gym.library(owner, { q: "虐腹" });
  assert.ok(abs.total > 0);
  assert.ok(
    abs.items[0].nameZh.includes("卷腹") || abs.items[0].nameZh.includes("仰卧起坐"),
  );
  const cable = await gym.library(owner, { q: "龙门架" });
  assert.ok(cable.total > 0);
  assert.equal(cable.items[0].equipment, "cable");
  const back = await gym.library(owner, { q: "练背" });
  assert.ok(back.total > 150);
  const first = back.items[0];
  assert.ok(
    first.bodyPart === "back" ||
      first.nameZh.includes("背") ||
      ["lats", "latissimus dorsi", "upper back", "lower back", "trapezius", "traps", "rhomboids"].includes(first.target),
  );
});

test("library: muscle accepts comma-separated equivalent codes", async () => {
  const quad = await gym.library(owner, { muscle: "quadriceps", role: "primary" });
  const quads = await gym.library(owner, { muscle: "quads", role: "primary" });
  const multi = await gym.library(owner, {
    muscle: "quadriceps,quads",
    role: "primary",
  });
  assert.ok(quad.total > 0 && quads.total > 0);
  // target/bodyPart 都是单值字段，两组结果不重叠，多值总数恰为两者之和
  assert.equal(multi.total, quad.total + quads.total);
  assert.ok(
    multi.items.every(
      (e: any) =>
        e.target === "quadriceps" ||
        e.target === "quads" ||
        e.bodyPart === "quadriceps" ||
        e.bodyPart === "quads",
    ),
  );
});

test("library: ranking puts name matches ahead of instruction mentions", async () => {
  const r = await gym.library(owner, { q: "卧推" });
  assert.ok(r.items[0].nameZh.includes("卧推"));
  assert.ok(r.items.slice(0, 5).every((e: any) => e.nameZh.includes("卧推")));
  // 无查询时浏览顺序不变
  const browse = await gym.library(owner, { limit: 4 });
  assert.equal(browse.items[0].id, "motion:squat");
});
