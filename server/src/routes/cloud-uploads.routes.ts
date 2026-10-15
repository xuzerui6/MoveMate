import {Router} from 'express';
import {readAvatar} from '../storage/avatars';

export const cloudUploadsRouter=Router();
cloudUploadsRouter.get('/:name',async(req,res,next)=>{
  try {
    const file=await readAvatar(req.params.name);
    if(!file){res.status(404).end();return}
    res.setHeader('Content-Type',file.content_type);
    res.setHeader('Cache-Control','public,max-age=31536000,immutable');
    res.send(Buffer.from(file.content));
  } catch(error){next(error)}
});
