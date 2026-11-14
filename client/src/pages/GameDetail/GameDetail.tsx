import {useCallback,useEffect,useRef,useState} from 'react';
import {useParams,useNavigate} from 'react-router-dom';
import {useGameDetail} from '../../hooks/useGameDetail';
import {useChat} from '../../hooks/useChat';
import {useAuthStore} from '../../stores/authStore';
import {showToast} from '../../hooks/useAuth';
import {getErrorMessage} from '../../api/client';
import * as gamesApi from '../../api/games';
import * as socialApi from '../../api/social';
import {Header} from '../../features/motion/components/Header';
import {Icon} from '../../features/motion/components/Icons';
import GameHeader from './GameHeader';
import MemberList from './MemberList';
import ChatList from './ChatList';
import ChatInput from './ChatInput';
import HostActions from './HostActions';
import GroupPlan from '../../features/gym/GroupPlan';
import SportTimer from '../../features/motion/SportTimer';
import {bossFightEntryVisible,bossFightTeaserVisible,bossEntryCopy,bossTeaserCopy} from '../../features/motion/lib/bossFightState';
import InviteFriendsDialog from '../../features/social/InviteFriendsDialog';
import {fillMode,inviteGate} from '../../features/social/socialLogic';
import type {FriendshipStatus} from '../../types';
import './GameDetail.css';
const stages:Record<string,[string,string]>={recruiting:['招募搭子中','加入活动后，可以在交流区一起协调。'],full:['搭子已集齐','请按约定时间到场，在签到窗口内完成签到。'],ready:['即将开始','到场后签到，发起人确认成员到场并开始活动。'],in_progress:['一起运动中','每人独立开始计时，休息时记得暂停。'],completed:['这场运动已结束','个人有效运动量和 XP 以服务器结算结果为准。'],cancelled:['活动已取消','本场活动停止加入，交流区已关闭。'],archived:['活动已归档','你可以从运动记录查看自己的结算结果。']};
export default function GameDetail(){
 const {id}=useParams<{id:string}>(),navigate=useNavigate(),user=useAuthStore(s=>s.user);
 const {game,loading,error,refreshNotice,actionLoading,join,leave,cancel,confirmStart,confirmEnd,checkIn,confirmAttendance,refetch}=useGameDetail(id);
 const isCreator=Number(game?.host_id)===Number(user?.id),member=game?.participants?.find((p:any)=>Number(p.user_id)===Number(user?.id)),isMember=Boolean(member);
 const {messages,loading:chatLoading,error:chatError,refetch:retryChat,sendMessage,bottomRef}=useChat(isMember&&!['archived','cancelled'].includes(game?.status||'')?id:undefined);
 // 好友关系表（成员行「加为好友」按钮形态）：好友→friends，申请过我的人→pending_in
 const [friendStatusMap,setFriendStatusMap]=useState<Map<number,FriendshipStatus>>(new Map());
 const [inviteOpen,setInviteOpen]=useState(false);
 const [fillBusy,setFillBusy]=useState(false);
 const endNavRef=useRef(false);
 const refreshSocial=useCallback(async()=>{
   try{
     const [friends,requests]=await Promise.all([socialApi.fetchFriends(),socialApi.fetchIncomingRequests()]);
     const map=new Map<number,FriendshipStatus>();
     friends.forEach(f=>map.set(Number(f.user_id),'friends'));
     requests.forEach(r=>{if(!map.has(Number(r.requester_id)))map.set(Number(r.requester_id),'pending_in');});
     setFriendStatusMap(map);
   }catch{/* 关系读取失败不挡详情页，按钮按未加好友显示 */}
 },[]);
 useEffect(()=>{void refreshSocial();},[refreshSocial]);
 // 发起人点「确认结束」后，跳到结束页看纪念卡
 useEffect(()=>{
   if(endNavRef.current&&game?.status==='completed'&&id){endNavRef.current=false;navigate(`/game/${id}/summary`);}
 },[game?.status,id,navigate]);
 if(loading)return <div className="game-detail-page"><Header title="组局详情" back={()=>navigate('/groups')}/><div className="motion-loading">正在读取活动信息…</div></div>;
 if(error||!game)return <div className="game-detail-page"><Header title="组局详情" back={()=>navigate('/groups')}/><div className="empty-state"><Icon name="users" size={40}/><h3>暂时无法读取活动</h3><p>{error||'活动不存在'}</p><button className="btn btn--primary" onClick={()=>window.location.reload()}>重新加载</button></div></div>;
 const hasCheckedIn=Boolean(member?.checked_in_at),attendanceConfirmed=Boolean(member?.attendance_confirmed_at);
 const phase=['recruiting','full'].includes(game.status)?0:game.status==='ready'?1:game.status==='in_progress'?2:3;
 const disabled=['archived','cancelled'].includes(game.status),readOnly=game.status==='completed',stage=stages[game.status]||['活动详情',''];
 const handleConfirmEnd=async()=>{endNavRef.current=true;await confirmEnd();};
 const copyShareLink=async()=>{
   const url=`${window.location.origin}/game/${game.id}`;
   try{await navigator.clipboard.writeText(url);showToast('链接复制好了，发给好友吧','success');}
   catch{showToast('复制没成功，长按地址栏复制一下吧','error');}
 };
 const mode=fillMode(game);
 const remaining=Math.max(0,game.max_players-game.member_count);
 const toggleFill=async(open:boolean)=>{
   setFillBusy(true);
   try{await gamesApi.setFillOpen(String(game.id),open);showToast(open?'已开放到大厅补人':'已关掉大厅补位','success');await refetch();}
   catch(err){showToast(getErrorMessage(err),'error');}
   finally{setFillBusy(false);}
 };
 const showSocialActions=(isMember||isCreator)&&['recruiting','full','ready'].includes(game.status);
 // 邀请按钮跟服务端 inviteToGame 同口径：仅发起人、且未到 ready 才能邀
 const inviteState=inviteGate({isCreator,status:game.status});
 const showEndBanner=isMember&&['completed','archived'].includes(game.status);
 return <div className="game-detail-page"><Header title="组局详情" back={()=>navigate('/groups')}/>
 {refreshNotice&&<div className="game-refresh-note" role="status">{refreshNotice}</div>}
 <div className="game-detail-grid"><section className="game-overview"><GameHeader game={game}/><div className="activity-phases" aria-label="活动阶段">{['组局','签到','运动','结束'].map((label,i)=><span key={label} className={i<=phase?'is-active':''}>{i<phase&&<Icon name="check" size={16}/>}<b>{label}</b>{i<3&&<Icon name="caret" size={16}/>}</span>)}</div>
 {game.status!=='in_progress'&&<><div className="game-stage-note" role="status"><Icon name={game.status==='completed'?'check':'users'}/><span><b>{stage[0]}</b><small>{stage[1]}</small></span></div></>}
 {game.sport_type==='fitness'&&<GroupPlan game={game} canTrain={isMember&&hasCheckedIn&&game.status==='in_progress'}/>}
 {game.sport_type!=='fitness'&&isMember&&hasCheckedIn&&['in_progress','completed'].includes(game.status)&&<section className="activity-personal"><div className="section-title"><h2>我的运动</h2><span className="activity-attendance">已签到</span></div><p>{game.status==='in_progress'?'活动已开始，可以记录你自己的运动量。':'活动已结束，个人运动量以结算结果为准。'}</p><SportTimer gameId={game.id} sportType={game.sport_type} enabled={game.status==='in_progress'}/></section>}
 {bossFightEntryVisible({isMember,checkedInAt:member?.checked_in_at,gameStatus:game.status})&&<section className="activity-personal"><div className="section-title"><h2>组队打怪</h2><span className="activity-attendance">新玩法</span></div><p>{bossEntryCopy(game.sport_type)}</p><button className="btn btn--primary" onClick={()=>navigate(`/game/${game.id}/boss-fight`)}>去打怪</button></section>}
 {bossFightTeaserVisible({isMember,checkedInAt:member?.checked_in_at,gameStatus:game.status})&&<section className="activity-personal boss-fight-teaser"><div className="section-title"><h2>组队打怪</h2><span className="activity-attendance boss-fight-teaser__badge">开局后开启</span></div><p>{bossTeaserCopy(game.sport_type,hasCheckedIn)}</p><button className="btn btn--secondary" onClick={()=>navigate('/boss-Atlas')}>先看看怪兽图鉴</button></section>}
 {showEndBanner&&<section className="game-end-banner"><h2>这一局结束啦</h2><p>看看这局的纪念页：把一起练的人加成好友，顺手约好下周再练。</p><button className="btn btn--primary" onClick={()=>navigate(`/game/${game.id}/summary`)}>去看看</button></section>}
 <MemberList participants={game.participants||[]} creatorId={game.host_id} isCreator={isCreator} gameState={game.status} actionLoading={actionLoading} onConfirmAttendance={confirmAttendance} gameId={String(game.id)} gameStartTime={game.start_time} friendStatus={friendStatusMap} onSocialChanged={refreshSocial} onRemoved={refetch}/>
 {showSocialActions&&<section className="game-social-actions"><h3>喊好友来</h3><div className="game-social-buttons">{inviteState==='can-invite'&&<button className="btn btn--primary" onClick={()=>setInviteOpen(true)}>邀请好友</button>}{inviteState==='ready-blocked'&&<button className="btn btn--primary" disabled>邀请好友</button>}<button className="btn btn--secondary" onClick={()=>void copyShareLink()}>复制局链接</button></div>{inviteState==='ready-blocked'&&<p className="game-fill-status">活动马上开始，不能再邀请人了。</p>}
 {game.visibility==='friends'&&isCreator&&<div className="game-fill-control">
   {mode==='public'&&<p className="game-fill-status">这个局已经在大厅里了，谁都能来。</p>}
   {mode==='closed'&&<><p className="game-fill-status">还剩 {remaining} 个位置，现在只有你的好友能进。</p><button className="btn btn--outline" disabled={fillBusy} onClick={()=>void toggleFill(true)}>{fillBusy?'处理中...':'开放补位'}</button></>}
   {mode==='open-manual'&&<><p className="game-fill-status">还剩 {remaining} 个位置，已开放到大厅补人。</p><button className="btn btn--outline" disabled={fillBusy} onClick={()=>void toggleFill(false)}>{fillBusy?'处理中...':'关闭补位'}</button></>}
   {mode==='open-auto'&&<p className="game-fill-status">还剩 {remaining} 个位置，已按你建局时的设置自动开放到大厅补人。</p>}
 </div>}
 </section>}
 <div className="game-management"><h3>{isCreator?'发起人管理':'我的参与'}</h3><HostActions isCreator={isCreator} gameState={game.status} onJoin={join} onLeave={leave} onCancel={cancel} onConfirmStart={confirmStart} onConfirmEnd={handleConfirmEnd} onCheckIn={checkIn} isMember={isMember} hasCheckedIn={hasCheckedIn} attendanceConfirmed={attendanceConfirmed} actionLoading={actionLoading}/></div></section>
 <aside className="game-chat"><h3><Icon name="users" size={20}/>{disabled?'交流区已关闭':readOnly?'交流记录 · 只读':'活动聊天'}<span>{isMember?'活动成员可见':'加入后参与交流'}</span></h3>{chatLoading?<div className="motion-loading">正在读取消息…</div>:<ChatList messages={messages} bottomRef={bottomRef}/>}
 {chatError&&<div className="inline-error" role="alert"><p>{chatError}</p><button className="btn btn--secondary" onClick={()=>void retryChat()}>重试读取消息</button></div>}
 {!disabled&&isMember&&<ChatInput onSend={sendMessage} disabled={readOnly} placeholder={readOnly?'活动结束，交流记录已保存':'说点什么，一起协调…'}/>}
 {!isMember&&!disabled&&<p className="chat-join-note">加入活动后，就可以和搭子交流了。</p>}</aside></div>
 {inviteOpen&&inviteState==='can-invite'&&<InviteFriendsDialog gameId={String(game.id)} members={game.participants||[]} onClose={()=>setInviteOpen(false)}/>}
 </div>;
}
