import { Router } from 'express';
import { authRequired } from '../middleware/auth';
import { config } from '../config';
import device from '../xiaozhi/device';
import activate from '../xiaozhi/activate';
process.env.XIAOZHI_COOKIE_SECRET ||= config.jwt.secret;
process.env.XIAOZHI_IDENTITY_MODE ||= 'disabled';
export const coachRouter=Router();
coachRouter.get('/ai/__status',authRequired,(_req,res)=>res.json({configured:Boolean(process.env.AI_BASE_URL && process.env.AI_API_KEY),xiaozhiEnabled:process.env.XIAOZHI_IDENTITY_MODE!=='disabled'}));
coachRouter.post('/ai/chat/completions',authRequired,async(req,res)=>{
  if(!process.env.AI_BASE_URL || !process.env.AI_API_KEY) {res.status(503).json({error:'本地陪练已启用'});return;}
  try{
    const upstream=await fetch(process.env.AI_BASE_URL.replace(/\/+$/,'')+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.AI_API_KEY},body:JSON.stringify({...req.body,stream:false,max_tokens:120}),signal:AbortSignal.timeout(8000)});
    res.status(upstream.status).type('application/json').send(await upstream.text());
  }catch{res.status(502).json({error:'陪练服务暂时不可用'});}
});
coachRouter.use('/api/xiaozhi',authRequired,(req,res,next)=>{
  res.cookie('motion_account',req.headers.authorization!.slice(7),{httpOnly:true,sameSite:'lax',secure:config.nodeEnv==='production',path:'/api/xiaozhi',maxAge:3600000});next();
});
coachRouter.post('/api/xiaozhi/device',device);
coachRouter.post('/api/xiaozhi/activate',activate);
