import { pool } from '../db';

export const AVATAR_CHUNK_SIZE = 1024 * 1024;

/** Called inside the profile transaction; a partial upload can never become visible. */
export async function saveAvatar(id: string, userId: number, bytes: Buffer, contentType: string): Promise<void> {
  if (process.env.CLOUDFLARE === '1') {
    await pool.query('INSERT INTO avatar_files(id,user_id,content_type,size,created_at) VALUES($1,$2,$3,$4,$5)',
      [id, userId, contentType, bytes.length, new Date().toISOString()]);
    for (let offset = 0, index = 0; offset < bytes.length; offset += AVATAR_CHUNK_SIZE, index++) {
      await pool.query('INSERT INTO avatar_chunks(file_id,part,content) VALUES($1,$2,$3)', [id, index, bytes.subarray(offset, offset + AVATAR_CHUNK_SIZE)]);
    }
    return;
  }
  await pool.query('INSERT INTO uploaded_avatars(id,user_id,content,content_type,created_at) VALUES($1,$2,$3,$4,$5)',
    [id, userId, bytes, contentType, new Date().toISOString()]);
}

export async function readAvatar(id: string): Promise<{ content: Buffer; content_type: string } | null> {
  if (process.env.CLOUDFLARE === '1') {
    const file = (await pool.query('SELECT content_type,size FROM avatar_files WHERE id=$1', [id])).rows[0];
    if (!file) return null;
    const chunks = (await pool.query('SELECT content FROM avatar_chunks WHERE file_id=$1 ORDER BY part', [id])).rows;
    const content = Buffer.concat(chunks.map(row => Buffer.from(row.content)));
    if (content.length !== file.size) throw new Error('头像数据不完整');
    return { content, content_type: file.content_type };
  }
  return (await pool.query('SELECT content,content_type FROM uploaded_avatars WHERE id=$1', [id])).rows[0] || null;
}
