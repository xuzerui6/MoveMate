import { useNavigate } from 'react-router-dom'
import { Header } from '../../features/motion/components/Header'
import { Icon } from '../../features/motion/components/Icons'
import { BOSSES, type BossInfo } from '../../features/motion/lib/bossCatalog'
import { useStore } from '../../features/motion/lib/store'
import './BossAtlas.css'

const AVAILABILITY_LINE: Record<BossInfo['availability'], string> = {
  fight: '现在就能打 · 组队开摄像头挑战它',
  roster: '夜幕兽群成员 · 之后开放',
  weekly: '还没开放',
  event: '活动限定 · 还没开放',
}

export default function BossAtlas() {
  const navigate = useNavigate()
  const { state } = useStore()
  const ownedSouvenirs = new Set((state.souvenirs || []).map((s) => s.item_id))
  return (
    <div className="ba-page">
      <Header title="怪兽图鉴" back={() => navigate(-1)} />
      <p className="ba-intro">夜幕兽群一家。打得过的是亮图，还没轮到的先上锁——最大的那只，要全校一起上。</p>
      <div className="ba-grid">
        {BOSSES.map((boss) => {
          const open = boss.availability === 'fight'
          const beaten = ownedSouvenirs.has(boss.souvenirItemId)
          return (
            <article key={boss.id} className={`ba-card${open ? ' open' : ' locked'}`}>
              <div className="ba-img-wrap">
                <img
                  src={boss.image}
                  alt={open ? boss.name : ''}
                  className={open ? '' : 'ba-silhouette'}
                  draggable={false}
                />
                {!open && <span className="ba-lock"><Icon name="lock" size={18} /></span>}
              </div>
              <div className="ba-meta">
                <b>{boss.name}</b>
                <span className="ba-tier">{boss.tier}</span>
              </div>
              <p>{boss.blurb}</p>
              <small>
                {boss.id === 'ziye_yanlong'
                  ? '全校周怪 · 还没开放'
                  : boss.id === 'suiyue_shoumo'
                    ? '每周一只 · 还没开放'
                    : beaten
                      ? '已打赢 · 首胜纪念到手'
                      : AVAILABILITY_LINE[boss.availability]}
              </small>
            </article>
          )
        })}
      </div>
    </div>
  )
}
