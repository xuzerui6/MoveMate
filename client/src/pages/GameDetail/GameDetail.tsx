import {useParams,useNavigate} from 'react-router-dom';
import {useGameDetail} from '../../hooks/useGameDetail';
import {useChat} from '../../hooks/useChat';
import {useAuthStore} from '../../stores/authStore';
import {Header} from '../../features/motion/components/Header';
import {Icon} from '../../features/motion/components/Icons';
import GameHeader from './GameHeader';
import MemberList from './MemberList';
import ChatList from './ChatList';
import ChatInput from './ChatInput';
import HostActions from './HostActions';
import GroupPlan from '../../features/gym/GroupPlan';
import SportTimer from '../../features/motion/SportTimer';
const stages:Record<string,[string,string]>={recruiting:['招募搭子中','加入活动后，可以在交流区一起协调。'],full:['搭子已集齐','请按约定时间到场，在签到窗口内完成签到。'],ready:['即将开始','到场后签到，发起人确认成员到场并开始活动。'],in_progress:['一起运动中','每人独立开始计时，休息时记得暂停。'],completed:['这场运动已结束','个人有效运动量和 XP 以服务器结算结果为准。'],cancelled:['活动已取消','本场活动停止加入，交流区已关闭。'],archived:['活动已归档','你可以从运动记录查看自己的结算结果。']};
export default function GameDetail(){
 const {id}=useParams<{id:string}>(),navigate=useNavigate(),user=useAuthStore(s=>s.user);
 const {game,loading,error,actionLoading,join,leave,cancel,confirmStart,confirmEnd,checkIn,confirmAttendance}=useGameDetail(id);
 const isCreator=Number(game?.host_id)===Number(user?.id),member=game?.participants?.find((p:any)=>Number(p.user_id)===Number(user?.id)),isMember=Boolean(member);
 const {messages,loading:chatLoading,error:chatError,refetch:retryChat,sendMessage,bottomRef}=useChat(isMember&&!['archived','cancelled'].includes(game?.status||'')?id:undefined);
 if(loading)return <div className="game-detail-page"><Header title="组局详情" back={()=>navigate('/groups')}/><div className="motion-loading">正在读取活动信息…</div></div>;
 if(error||!game)return <div className="game-detail-page"><Header title="组局详情" back={()=>navigate('/groups')}/><div className="empty-state"><Icon name="users" size={40}/><h3>暂时无法读取活动</h3><p>{error||'活动不存在'}</p><button className="btn btn--primary" onClick={()=>window.location.reload()}>重新加载</button></div></div>;
 const hasCheckedIn=Boolean(member?.checked_in_at),attendanceConfirmed=Boolean(member?.attendance_confirmed_at);
 const phase=['recruiting','full'].includes(game.status)?0:game.status==='ready'?1:game.status==='in_progress'?2:3;
 const disabled=['archived','cancelled'].includes(game.status),readOnly=game.status==='completed',stage=stages[game.status]||['活动详情',''];
 return <div className="game-detail-page"><Header title="组局详情" back={()=>navigate('/groups')}/>

 <div className="game-detail-grid"><section className="game-overview"><GameHeader game={game}/><div className="activity-phases" aria-label="活动阶段">{['组局','签到','运动','结束'].map((label,i)=><span key={label} className={i<=phase?'is-active':''}>{i<phase&&<Icon name="check" size={16}/>}<b>{label}</b>{i<3&&<Icon name="caret" size={16}/>}</span>)}</div>
 {game.status!=='in_progress'&&<><div className="game-stage-note" role="status"><Icon name={game.status==='completed'?'check':'users'}/><span><b>{stage[0]}</b><small>{stage[1]}</small></span></div></>}
 {game.sport_type==='fitness'&&<GroupPlan game={game} canTrain={isMember&&hasCheckedIn&&game.status==='in_progress'}/>}
 {game.sport_type!=='fitness'&&isMember&&hasCheckedIn&&['in_progress','completed'].includes(game.status)&&<section className="activity-personal"><div className="section-title"><h2>我的运动</h2><span className="activity-attendance">已签到</span></div><p>{game.status==='in_progress'?'活动已开始，可以记录你自己的运动量。':'活动已结束，个人运动量以结算结果为准。'}</p><SportTimer gameId={game.id} sportType={game.sport_type} enabled={game.status==='in_progress'}/></section>}
 <MemberList participants={game.participants||[]} creatorId={game.host_id} isCreator={isCreator} gameState={game.status} actionLoading={actionLoading} onConfirmAttendance={confirmAttendance}/>
 <div className="game-management"><h3>{isCreator?'发起人管理':'我的参与'}</h3><HostActions isCreator={isCreator} gameState={game.status} onJoin={join} onLeave={leave} onCancel={cancel} onConfirmStart={confirmStart} onConfirmEnd={confirmEnd} onCheckIn={checkIn} isMember={isMember} hasCheckedIn={hasCheckedIn} attendanceConfirmed={attendanceConfirmed} actionLoading={actionLoading}/></div></section>
 <aside className="game-chat"><h3><Icon name="users" size={20}/>{disabled?'交流区已关闭':readOnly?'交流记录 · 只读':'活动聊天'}<span>{isMember?'活动成员可见':'加入后参与交流'}</span></h3>{chatLoading?<div className="motion-loading">正在读取消息…</div>:<ChatList messages={messages} bottomRef={bottomRef}/>}
 {chatError&&<div className="inline-error" role="alert"><p>{chatError}</p><button className="btn btn--secondary" onClick={()=>void retryChat()}>重试读取消息</button></div>}
 {!disabled&&isMember&&<ChatInput onSend={sendMessage} disabled={readOnly} placeholder={readOnly?'活动结束，交流记录已保存':'说点什么，一起协调…'}/>}
 {!isMember&&!disabled&&<p className="chat-join-note">加入活动后，就可以和搭子交流了。</p>}</aside></div></div>;
}

