import {Router} from 'express';
import {pool} from '../db';

export const cloudUploadsRouter=Router();
cloudUploadsRouter.get('/:name',async(req,res,next)=>{
  try {
    const {rows}=await pool.query('SELECT content,content_type FROM uploaded_avatars WHERE id=$1',[req.params.name]);
    if(!rows[0]){res.status(404).end();return}
    res.setHeader('Content-Type',rows[0].content_type);
    res.setHeader('Cache-Control','public,max-age=31536000,immutable');
    res.send(Buffer.from(rows[0].content));
  } catch(error){next(error)}
});
