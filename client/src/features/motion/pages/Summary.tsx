import { useState } from 'react'
import AnimatedNumber from '../../../components/AnimatedNumber'
import AnimatedProgress from '../../../components/AnimatedProgress'
import { exerciseInfo } from '../lib/exercises'
import { AvatarFigure } from '../components/AvatarFigure'
import { Icon } from '../components/Icons'
import { useStore } from '../lib/store'
import { outfitLabels } from '../lib/outfits'
import { poseIssueCopy } from '../lib/poseFeedback'
import { buildSetReveal, COPY_WORKOUT_DONE } from '../lib/companionCopy'
import { SPORT_LABELS } from '../../../types'
import type { PoseIssue, WorkoutSession } from '../types'
import ShareCardButton from '../../share/ShareCardButton'
import { buildLevelCard, buildMotionSetCard, buildStreakCard } from '../../share/cardData'
import { milestoneCardSvg, setCardSvg } from '../../share/cardSvg'
const fmt = (seconds:number) => `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`
export function Summary({result,avatar,home}:{result:WorkoutSession;avatar:()=>void;home:()=>void}) {
  const {state,error,loading,refresh,setActiveOutfit,markOutfitsSeen}=useStore()
  const exercise=exerciseInfo(result.exerciseType),timer=result.source==='timer',demo=result.source==='demo'
  const pendingGrowth=Boolean(error)
  const scored=((result as any).scoreAccumulator?.count??(result.reps?1:0))>0
  const corrections=(Object.entries(result.correctionCounts||{}) as [PoseIssue,number][]).filter(([,count])=>count>0).sort((a,b)=>b[1]-a[1])
  const axes=exercise.axes
  const breakdown=[result.formBreakdown?.depth,result.formBreakdown?.stability,result.formBreakdown?.trunk,result.formBreakdown?.symmetry]
  // 组间揭晓（识别页 v2 §03）：先报进步（与同动作上一条已评分记录的真实差值），
  // 再四轴生长，最后只给一个小目标。演示不做对比断言。
  const previousSession=demo?undefined:[...state.history].reverse().find(h=>h.id!==result.id&&h.exerciseType===result.exerciseType&&h.source!=='demo'&&(h as any).formScore>0&&(h as any).formBreakdown)
  const fb=(v:any)=>({depth:v?.depth||0,stability:v?.stability||0,trunk:v?.trunk||0,symmetry:v?.symmetry||0})
  const reveal=buildSetReveal(fb(result.formBreakdown),previousSession?fb((previousSession as any).formBreakdown):null,{reps:result.reps,unit:exercise.unit,scored:scored&&!timer&&!demo,axisLabels:{depth:axes[0],stability:axes[1],trunk:axes[2],symmetry:axes[3]}})
  const topCorrectionCopy=corrections[0]?poseIssueCopy(corrections[0][0],result.exerciseType):null
  const topCorrection=topCorrectionCopy?`${topCorrectionCopy.label}：${topCorrectionCopy.action}`:null
  const revealGoal=topCorrection?`下一个小目标：${topCorrection}`:reveal.goalLine
  const [saveError,setSaveError]=useState('')
  const levelCard=(!demo&&result.levelAfter!=null&&result.levelBefore!=null&&result.levelAfter>result.levelBefore)?buildLevelCard({level:result.levelAfter,xp:state.xp,date:result.startTime||new Date()}):null
  const streakCard=!demo?buildStreakCard(state.history,state.streakDays):null
  const wear=async(outfit:typeof state.activeOutfit)=>{if(await setActiveOutfit(outfit)){await markOutfitsSeen([outfit]);setSaveError('')}else setSaveError('穿戴未保存，请重试。')}
  return <div className="page training-summary">
    <div className="training-summary-mark"><Icon name="check" size={30}/></div>
    <span className="eyebrow">{demo?'演示体验':'运动记录'}</span><h2>{demo?'演示完成':COPY_WORKOUT_DONE}</h2>
    {!demo&&state.streakDays>1&&<p className="training-done-line">连续运动第 {state.streakDays} 天，我都记着呢</p>}
    <p className="muted">{timer?SPORT_LABELS[result.exerciseType]||result.exerciseType:exercise.name} · {result.settled?'已保存并结算':'已保存，等待活动结算'}</p>
    {demo&&<p className="training-demo-note">演示，不计 XP，也不解锁装备。</p>}
    <div className="training-result-main"><div><small>有效运动时长</small><strong>{fmt(result.durationSeconds)}</strong></div><div><small>{demo?'演示经验':'本次获得'}</small><strong>+<AnimatedNumber value={result.xpEarned} fromZero/><em> XP</em></strong></div></div>
    {!timer&&!demo&&<section className="training-reveal" aria-label="这一组怎么样"><p className="training-reveal-lead">{reveal.progressLine}</p>{scored&&!demo&&<div className="training-reveal-axes">{axes.map((label,index)=><div className="training-breakdown" key={label}><span>{label}</span><AnimatedProgress value={breakdown[index]||0} delay={index*120}/><b>{breakdown[index]||0}</b></div>)}</div>}{revealGoal&&<p className="training-reveal-goal">{revealGoal}</p>}</section>}
    {!timer&&<div className="training-result-stats"><span><b>{result.reps} {exercise.unit}</b>完成动作</span><span><b>{scored?<AnimatedNumber value={result.formScore} fromZero/>:'—'}</b>{demo?'演示评分':'动作评分'}</span><span><b>{result.perfectReps} {exercise.unit}</b>高质量动作</span></div>}
    {pendingGrowth?<div className="training-error" role="status"><p>本次运动已保存。成长数据暂未更新，请单独重试。</p><button className="secondary" disabled={loading} onClick={()=>void refresh()}>{loading?'更新中…':'更新成长数据'}</button></div>:<div className="training-growth-row"><AvatarFigure size="small" view="front"/><span><b>Lv.{state.level} · 成长已记录</b><small>累计 {state.totalXp} XP{demo?' · 本次演示不增加经验':''}</small></span></div>}
    {(result.unlockedOutfits||[]).map(outfit=><div className="training-unlock" key={outfit}><span>新套装 · {outfitLabels[outfit]}</span><button className="secondary" disabled={state.activeOutfit===outfit} onClick={()=>void wear(outfit)}>{state.activeOutfit===outfit?'已穿戴':'立即穿戴'}</button></div>)}
    {saveError&&<p role="alert">{saveError}</p>}
    {!timer&&<details className="training-result-details"><summary>查看动作与训练详情</summary>
      {(!scored||demo)&&<>{!scored&&<p>本次没有可靠的完整动作评分；次数与结算结果仍以服务器记录为准。</p>}<h3>动作维度{demo?'（演示）':''}</h3>{axes.map((label,index)=><div className="training-breakdown" key={label}><span>{label}</span><AnimatedProgress value={breakdown[index]||0} delay={index*120}/><b>{scored?breakdown[index]||0:'—'}</b></div>)}</>}
      <h3>下次可以关注</h3>{corrections.length?corrections.slice(0,3).map(([issue,count])=><p key={issue}>{poseIssueCopy(issue,result.exerciseType).label} · {count} 次</p>):<p>{result.reps?'保持稳定的动作节奏。':'未完成完整动作，暂无评分线索。'}</p>}
      {['standing_leg_curl','one_arm_row','mountain_climber','split_squat'].includes(result.exerciseType)&&<p>左侧 {(result as any).scoreAccumulator?.leftReps||0} 次 · 右侧 {(result as any).scoreAccumulator?.rightReps||0} 次</p>}<p>陪练对话 {result.conversationTurnCount||0} 轮</p>
      {result.heartRateSource==='ble'&&<p>平均心率 {result.averageBpm??'—'} BPM · 最高 {result.maxBpm??'—'} BPM</p>}
    </details>}
    {!timer&&!demo&&<ShareCardButton label="分享本组高光" makeCard={()=>{const data=buildMotionSetCard(result,state.history);return {svg:setCardSvg(data),fileName:`movemate-set-${data.date.short.replace(/\./g,'')}.png`,title:'动伴 · 单组高光'}}}/>}
    {levelCard&&<ShareCardButton label="分享等级里程碑" makeCard={()=>({svg:milestoneCardSvg(levelCard),fileName:`movemate-level-${levelCard.date.short.replace(/\./g,'')}.png`,title:'动伴 · 等级提升'})}/>}
    {streakCard&&<ShareCardButton label="分享连续打卡里程碑" makeCard={()=>({svg:milestoneCardSvg(streakCard),fileName:`movemate-streak-${streakCard.date.short.replace(/\./g,'')}.png`,title:'动伴 · 连续打卡'})}/>}
    <button className="primary" onClick={home}>返回训练<Icon name="arrow"/></button><button className="text-btn" onClick={avatar}>查看我的形象</button>
  </div>
}
