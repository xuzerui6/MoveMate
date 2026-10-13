import { progress } from '../services/motion.service';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {randomUUID} from 'node:crypto';
import { UserService } from '../services/user.service';
import { validate } from '../middleware/validate';
import { authRequired } from '../middleware/auth';
import { pool,withTransaction } from '../db/pool';

const router = Router();

const updateProfileSchema = z.object({
  nickname: z.string().min(1).max(20).optional(),
  avatar_url: z.string().max(500).optional(),
  department: z.string().max(100).optional(),
  campus_id: z.coerce.number().int().positive().optional(),
  sport_preferences: z.string().max(500).optional(),
  qq_email: z.string().max(200).optional(),
});

// GET /public/:id — 公开的用户信息（仅院系+运动偏好，不泄露隐私）
router.get('/public/:id', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      res.status(400).json({ code: 40000, message: '无效的用户 ID', data: null });
      return;
    }
    const { rows } = await pool.query(
      `SELECT id, nickname, avatar_url, department, sport_preferences
       FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    if (!rows[0]) {
      res.status(404).json({ code: 40404, message: '用户不存在', data: null });
      return;
    }
    const row = rows[0];
    res.json({
      code: 0, message: 'success',
      data: {
        id: Number(row.id),
        nickname: row.nickname,
        avatar_url: row.avatar_url,
        department: row.department || '',
        sport_preferences: (() => {
          try { return JSON.parse(row.sport_preferences || '[]'); } catch { return []; }
        })(),
      }
    });
  } catch (err) { next(err); }
});

// GET /me
router.get('/me', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) { res.status(401).json({ code: 40101, message: '未登录', data: null }); return; }
    const profile = await UserService.getProfile(req.user.id);
    res.json({ code: 0, message: 'success', data: profile });
  } catch (err) { next(err); }
});

// PUT /me
router.put('/me', authRequired, validate(updateProfileSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) { res.status(401).json({ code: 40101, message: '未登录', data: null }); return; }
    const user = await UserService.updateProfile(req.user.id, req.body);
    res.json({ code: 0, message: '更新成功', data: { user } });
  } catch (err) { next(err); }
});

// GET /me/games — 我参与的运动局
router.get('/me/games', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) { res.status(401).json({ code: 40101, message: '未登录', data: null }); return; }
    const { rows } = await pool.query(
      `SELECT g.*, c.name AS campus_name, v.name AS venue_name,
       u.nickname AS creator_name,
       u.reward_level AS host_reward_level,
       COALESCE(mp.total_xp,0) AS host_reward_points,
       gm.checked_in_at, gm.attendance_confirmed_at, gm.reward_points, gm.reward_granted_at,
       CASE WHEN g.host_id = $1 THEN true ELSE false END AS is_host,
       true AS is_member
       FROM games g
       INNER JOIN game_members gm ON g.id = gm.game_id AND gm.left_at IS NULL
       LEFT JOIN campuses c ON c.id = g.campus_id
       LEFT JOIN venues v ON v.id = g.venue_id
       LEFT JOIN users u ON u.id = g.host_id
       LEFT JOIN motion_profiles mp ON mp.user_id = g.host_id
       WHERE gm.user_id = $1
         AND gm.hidden_in_profile_at IS NULL
       ORDER BY g.start_time DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json({ code: 0, message: 'success', data: rows.map((row:any)=>({...row,host_reward_level:progress(Number(row.host_reward_points)).level})) });
  } catch (err) { next(err); }
});

// DELETE /me/games/:id — 从“我的局”移除已结束记录
router.delete('/me/games/:id', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) { res.status(401).json({ code: 40101, message: '未登录', data: null }); return; }

    const gameId = parseInt(req.params.id, 10);
    if (isNaN(gameId)) {
      res.status(400).json({ code: 40000, message: '无效的局 ID', data: null });
      return;
    }

    const { rows } = await pool.query(
      `SELECT g.id, g.status
       FROM games g
       INNER JOIN game_members gm ON gm.game_id = g.id
       WHERE g.id = $1
         AND gm.user_id = $2
         AND gm.left_at IS NULL
         AND gm.hidden_in_profile_at IS NULL
       LIMIT 1`,
      [gameId, req.user.id]
    );

    if (!rows[0]) {
      res.status(404).json({ code: 40404, message: '该记录不存在', data: null });
      return;
    }

    if (!['completed', 'archived', 'cancelled'].includes(String(rows[0].status))) {
      res.status(400).json({ code: 40010, message: '只有已结束或已取消的局才能从列表删除', data: null });
      return;
    }

    await pool.query(
      `UPDATE game_members
       SET hidden_in_profile_at = NOW()
       WHERE game_id = $1
         AND user_id = $2
         AND left_at IS NULL
         AND hidden_in_profile_at IS NULL`,
      [gameId, req.user.id]
    );

    res.json({ code: 0, message: '已从我的局删除', data: { game_id: gameId } });
  } catch (err) { next(err); }
});

// GET /leaderboard — 积分排行榜
router.get('/leaderboard', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) { res.status(401).json({ code: 40101, message: '未登录', data: null }); return; }

    const { rows } = await pool.query(
      `SELECT u.id, u.nickname, u.avatar_url, u.department,
              COALESCE(mp.total_xp,0) AS reward_points, u.reward_level, u.reward_streak,
              u.completed_games, u.hosted_completed_games,
              c.name AS campus_name
       FROM users u
       LEFT JOIN campuses c ON c.id = u.campus_id
       LEFT JOIN motion_profiles mp ON mp.user_id=u.id
       ORDER BY COALESCE(mp.total_xp,0) DESC, u.completed_games DESC, u.hosted_completed_games DESC, u.id ASC`,
    );

    const rankings = rows.map((row, index) => ({
      rank: index + 1,
      id: Number(row.id),
      nickname: row.nickname,
      avatar_url: row.avatar_url,
      department: row.department || '',
      campus_name: row.campus_name || '',
      reward_points: Number(row.reward_points ?? 0),
      reward_level: progress(Number(row.reward_points || 0)).level,
      reward_streak: Number(row.reward_streak ?? 0),
      completed_games: Number(row.completed_games ?? 0),
      hosted_completed_games: Number(row.hosted_completed_games ?? 0),
    }));

    const currentUser = rankings.find((item) => item.id === req.user!.id) || null;

    res.json({
      code: 0,
      message: 'success',
      data: {
        rankings: rankings.slice(0, 20),
        current_user: currentUser,
      },
    });
  } catch (err) { next(err); }
});

// POST /avatar — 上传头像（必须在 /:id 之前注册）
// 安全：不保留原始扩展名（防伪装文件）+ 上传后校验文件内容（magic bytes）
const avatarUpload = multer({
  storage: process.env.TURSO_DATABASE_URL?multer.memoryStorage():multer.diskStorage({
    destination: path.join(__dirname, '..', '..', 'uploads'),
    filename: (_req, _file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      // 不信任原始扩展名，统一 .jpg；真实类型由内容校验决定
      cb(null, 'avatar-' + uniqueSuffix + '.jpg');
    },
  }),
  limits: { fileSize: process.env.VERCEL === '1' ? 4 * 1024 * 1024 : 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    cb(null, allowed.includes(file.mimetype));
  },
});

/** 读取文件头识别真实图片类型（magic bytes），非图片返回 null */
function detectImageType(buf: Buffer): string | null {
  // JPEG: FF D8 FF
  if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return '.jpg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length > 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47 &&
    buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A
  ) return '.png';
  // GIF: GIF8
  if (buf.length > 4 && buf.toString('ascii', 0, 4) === 'GIF8') return '.gif';
  // WEBP: RIFF....WEBP
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  return null;
}

router.post('/avatar', authRequired, avatarUpload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  let savedPath: string | null = null;
  try {
    if (!req.file) { res.status(400).json({ code: 40000, message: '请选择图片文件', data: null }); return; }
    if(process.env.TURSO_DATABASE_URL) {
      const bytes=req.file.buffer;
      const ext=detectImageType(bytes);
      if(!ext){res.status(400).json({code:40000,message:'文件不是有效的图片格式',data:null});return}
      const name='avatar-'+randomUUID()+ext;
      const contentType=ext==='.jpg'?'image/jpeg':'image/'+ext.slice(1);
      const url='/uploads/'+name;
      await withTransaction(async client=>{
        await client.query('INSERT INTO uploaded_avatars(id,user_id,content,content_type,created_at) VALUES($1,$2,$3,$4,$5)',[name,req.user!.id,bytes,contentType,new Date().toISOString()]);
        await UserService.updateProfile(req.user!.id,{avatar_url:url});
      });
      res.json({code:0,message:'头像上传成功',data:{url}});return;
    }
    savedPath = req.file.path;
    // 内容校验：文件头必须是真实图片格式（防伪装成图片的恶意文件）
    const head = fs.readFileSync(savedPath);
    const realExt = detectImageType(head);
    if (!realExt) {
      fs.unlinkSync(savedPath); // 删除伪装文件
      res.status(400).json({ code: 40000, message: '文件不是有效的图片格式', data: null });
      return;
    }
    // 统一以检测出的真实类型存储，避免扩展名与内容不符
    const finalPath = savedPath.replace(/\.jpg$/, realExt);
    if (finalPath !== savedPath) fs.renameSync(savedPath, finalPath);
    const url = '/uploads/' + path.basename(finalPath);
    await UserService.updateProfile(req.user!.id, { avatar_url: url });
    res.json({ code: 0, message: '头像上传成功', data: { url } });
  } catch (err) {
    // 失败时清理已保存的文件
    if (savedPath) { try { fs.unlinkSync(savedPath); } catch {} }
    next(err);
  }
});

// GET /:id
router.get('/:id', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) { res.status(400).json({ code: 40000, message: '用户ID格式不正确', data: null }); return; }
    const profile = await UserService.getPublicProfile(userId);
    res.json({ code: 0, message: 'success', data: profile });
  } catch (err) { next(err); }
});

export default router;
