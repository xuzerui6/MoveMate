import type { MilestoneCardData, SetCardData, WorkoutCardData } from './cardData'

/**
 * 分享卡 SVG 渲染层（纯函数，输出 1080×1350 真尺寸 SVG 字符串）。
 * 视觉定版：share-card-design-board-v2.html 的 R2 白底富层版——
 * 斜切品牌绿渐变英雄带、带内 V4-B 星图（白线版）高亮、带外分层数据卡。
 * 板内按 1:3 渲染，本文件尺寸 = 板面标注值 ×3（导出实际值）。
 */

export const CARD_WIDTH = 1080
export const CARD_HEIGHT = 1350

const FONT = `-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif`
const PRIMARY = '#008a40'
const PRIMARY_LIGHT = '#00c65e'
const PRIMARY_DARK = '#08783b'
const MINT = '#e5faee'
const MINT_PALE = '#c9f5da'
const BAND_KICKER = '#b6ffd2'
const INK = '#080b09'
const MUTED = '#68767e'
const LINE = '#e3e9e6'
const SOFT = '#f6f8f7'
const PAD = 72
const RIGHT = CARD_WIDTH - PAD

export const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** 粗略文字宽度估算（CJK 按 1em，数字 0.56em），只用于 chip/徽章定宽与防溢出。 */
export function estTextWidth(text: string, fontSize: number, letterSpacing = 0): number {
  let units = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) || 0
    if (code >= 0x2e80) units += 1
    else if (ch >= '0' && ch <= '9') units += 0.56
    else if (ch >= 'A' && ch <= 'Z') units += 0.72
    else if (ch >= 'a' && ch <= 'z') units += 0.55
    else if (ch === ' ') units += 0.3
    else if (ch === '·') units += 0.4
    else if (ch === '.') units += 0.3
    else if (ch === '/') units += 0.4
    else units += 0.6
  }
  return units * fontSize + letterSpacing * Math.max(0, [...text].length - 1)
}

/** 超宽时用 textLength 压缩字距与字形（不截断、不换行），与板上「降字号不截断」同向。 */
const fitAttrs = (text: string, fontSize: number, maxWidth: number, letterSpacing = 0) =>
  estTextWidth(text, fontSize, letterSpacing) > maxWidth
    ? ` textLength="${Math.round(maxWidth)}" lengthAdjust="spacingAndGlyphs"`
    : ''

const LOGO_GLYPH = `<circle cx="50" cy="20" r="11"/><path d="M50 31v58M50 46 L30 50 L23 78 L29 104M50 46 L70 50 L77 78 L71 104M50 89 L40 95 L36 136 L38 172M50 89 L60 95 L64 136 L62 172"/>`

function logoMark(x: number, y: number, boxFill: string, glyphStroke: string): string {
  return `<rect x="${x}" y="${y}" width="66" height="66" rx="14" fill="${boxFill}"/><g transform="translate(${x + 21.75},${y + 10.5}) scale(0.225)" fill="none" stroke="${glyphStroke}" stroke-width="9" stroke-linecap="round">${LOGO_GLYPH}</g>`
}

function brandRow(opts: { dark: boolean; dateText: string }): string {
  const nameFill = opts.dark ? '#ffffff' : INK
  const emFill = opts.dark ? MINT_PALE : MUTED
  const dateFill = opts.dark ? MINT_PALE : MUTED
  return `${logoMark(PAD, 60, opts.dark ? '#ffffff' : PRIMARY, opts.dark ? PRIMARY : '#ffffff')}
<text x="156" y="105" font-family="${FONT}" font-size="36" font-weight="800" fill="${nameFill}">动伴<tspan dx="10" font-size="32" font-weight="600" fill="${emFill}">MoveMate</tspan></text>
<text x="${RIGHT}" y="102" text-anchor="end" font-family="${FONT}" font-size="30" font-weight="600" letter-spacing="1.2" fill="${dateFill}">${escapeXml(opts.dateText)}</text>`
}

/**
 * V4-B 星座数据版 · 绿带白线版（几何与 v2 板 v4b-band-mini 符号逐字一致，无角度标签）。
 * 2026-11-07 真机修正：板面在 1:3 缩放下成立的细线（1–2 单位）+ 低透明浅绿，
 * 在 1080 真尺寸 + 亮绿带右段上几乎溶掉（像素实测 A 卡带内差异覆盖仅 3.5%、B 卡为 0），
 * 故几何不动、只加强呈现：主链 2→3.4、次链 1.7→2.6、虚线链 1→1.8 且颜色
 * #c9f5da→#eafff2、不透明度 .55→.85，节点环线宽 1.4→2.2，达到板样「白线近全显成片呈现」。
 */
const BAND_MOTIF = `<g stroke="#eafff2" stroke-width="1.8" opacity=".85" fill="none"><path d="M158 112 L170 60 L186 98"/><path d="M42 92 L66 52" stroke-dasharray="3.5 4"/><path d="M88 118 L158 112" stroke-dasharray="3.5 4" opacity=".8"/></g><path d="M30 190 A95 95 0 0 1 66 52" fill="none" stroke="#eafff2" stroke-width="2.2" stroke-dasharray="3 4.5" opacity=".95"/><g stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity=".95"><path d="M11 140 L19 140 M15 136 L15 144"/><path d="M21 82 L29 82 M25 78 L25 86"/></g><path d="M30 190 L88 118 L66 52" fill="none" stroke="#ffffff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M150 150 L146 205 L152 252" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><g><circle cx="66" cy="52" r="10" fill="none" stroke="#ffffff" stroke-width="2.2"/><circle cx="66" cy="52" r="5" fill="#ffffff"/><circle cx="66" cy="52" r="1.6" fill="#08783b"/><circle cx="88" cy="118" r="9.5" fill="none" stroke="#ffffff" stroke-width="2.2"/><circle cx="88" cy="118" r="5" fill="#ffffff"/><circle cx="88" cy="118" r="1.6" fill="#08783b"/><circle cx="30" cy="190" r="3.8" fill="#ffffff"/><circle cx="150" cy="150" r="3.8" fill="#ffffff"/><circle cx="146" cy="205" r="3.4" fill="#ffffff"/><circle cx="152" cy="252" r="3.4" fill="#ffffff"/></g><circle cx="170" cy="60" r="6" fill="none" stroke="#eafff2" stroke-width="1.8"/><g fill="#ffffff"><circle cx="170" cy="60" r="2.8"/><circle cx="186" cy="98" r="2.2"/><circle cx="158" cy="112" r="2.2"/><circle cx="42" cy="92" r="2.2"/><circle cx="182" cy="182" r="2.2"/><circle cx="112" cy="228" r="2.2"/></g><g stroke="#b6ffd2" stroke-width="2" stroke-linecap="round"><path d="M168 226 L180 226 M174 220 L174 232"/><path d="M24 140 L34 140 M29 135 L29 145"/></g>`

/** 英雄带星图（三卡共用带组件的统一落点：定版强度、锚定带内右区）。 */
function bandMotif(tx: number, ty: number, scale: number): string {
  return `<g transform="translate(${tx},${ty}) scale(${scale})">${BAND_MOTIF}</g>`
}

function defs(): string {
  return `<defs>
<linearGradient id="bandGrad" x1="0" y1="0" x2="1" y2="0.28"><stop offset="0" stop-color="#08783b"/><stop offset=".52" stop-color="#008a40"/><stop offset="1" stop-color="#00c65e"/></linearGradient>
<linearGradient id="axisGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#008a40"/><stop offset="1" stop-color="#00c65e"/></linearGradient>
<linearGradient id="badgeGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e5faee"/><stop offset="1" stop-color="#cdf3dc"/></linearGradient>
<filter id="cellShadow" x="-20%" y="-30%" width="140%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#0d2519" flood-opacity="0.08"/></filter>
<filter id="ringShadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14"/></filter>
</defs>`
}

function footer(rightNote: string): string {
  return `<line x1="${PAD}" y1="1180" x2="${RIGHT}" y2="1180" stroke="${LINE}" stroke-width="1"/>
<text x="${PAD}" y="1236" font-family="${FONT}" font-size="39" font-weight="800" letter-spacing="2.3" fill="${PRIMARY_DARK}">每次运动，都算数。</text>
<text x="${PAD}" y="1276" font-family="${FONT}" font-size="26" font-weight="600" letter-spacing="3.6" fill="${MUTED}">MOVEMATE · 动伴</text>
<text x="${RIGHT}" y="1276" text-anchor="end" font-family="${FONT}" font-size="26" font-weight="600" letter-spacing="3.6" fill="${MUTED}"${fitAttrs(rightNote, 26, 560, 3.6)}>${escapeXml(rightNote)}</text>`
}

function svgRoot(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">${defs()}<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="#ffffff"/>${body}</svg>`
}

/* ---------------- 卡 A · 训练完成卡（R2） ---------------- */

export function workoutCardSvg(data: WorkoutCardData): string {
  const band = `<clipPath id="bandClipA"><polygon points="0,0 ${CARD_WIDTH},0 ${CARD_WIDTH},592 0,640"/></clipPath>
<polygon points="0,0 ${CARD_WIDTH},0 ${CARD_WIDTH},592 0,640" fill="url(#bandGrad)"/>
<g clip-path="url(#bandClipA)">${bandMotif(742, 150, 1.9)}
${brandRow({ dark: true, dateText: data.date.full })}
<text x="${PAD}" y="238" font-family="${FONT}" font-size="30" font-weight="700" letter-spacing="9.6" fill="${BAND_KICKER}">WORKOUT COMPLETE</text>
<text x="${PAD}" y="330" font-family="${FONT}" font-size="81" font-weight="800" fill="#ffffff">训练完成</text>
<text x="${PAD}" y="412" font-family="${FONT}" font-size="30" font-weight="700" letter-spacing="5.4" fill="${MINT_PALE}">总时长 TOTAL TIME</text>
${heroDuration(data)}
</g>`

  const cells: { v: string; u: string; l: string }[] = [
    { v: String(data.exerciseCount), u: '个', l: '动作 EXERCISES' },
    { v: String(data.totalReps), u: '次', l: '总次数 REPS' },
  ]
  if (data.avgScore != null) cells.push({ v: String(data.avgScore), u: '分', l: '平均分 AVG SCORE' })
  cells.push({ v: String(data.totalSets), u: '组', l: '总组数 SETS' })
  const cellW = 453
  // 无连续徽章时（streakDays=0，含 3 格降级版式）网格下移并加高，填掉网格底
  // 与落款线之间的尾部空档（原 130px）；有徽章时保持原几何——徽章正好补位该空档。
  const bare = data.streakDays <= 0
  const cellH = bare ? 172 : 160
  const gridTop = bare ? 724 : 700
  const grid = cells
    .map((cell, i) => {
      const wide = cells.length === 3 && i === 2
      const x = wide ? PAD : PAD + (i % 2) * (cellW + 30)
      const y = gridTop + Math.floor(i / 2) * (cellH + 30)
      const w = wide ? RIGHT - PAD : cellW
      return `<g><rect x="${x}" y="${y}" width="${w}" height="${cellH}" rx="12" fill="#ffffff" stroke="${LINE}" filter="url(#cellShadow)"/>
<text x="${x + 42}" y="${y + 92}" font-family="${FONT}" font-size="69" font-weight="800" fill="${INK}">${escapeXml(cell.v)}<tspan dx="6" font-size="33" font-weight="700" fill="${MUTED}">${escapeXml(cell.u)}</tspan></text>
<text x="${x + 42}" y="${y + 134}" font-family="${FONT}" font-size="30" font-weight="600" letter-spacing="3" fill="${MUTED}">${escapeXml(cell.l)}</text></g>`
    })
    .join('')

  let badge = ''
  if (data.streakDays > 0) {
    const text = data.streakDays === 1 ? '新的一天，从今天开始' : `连续运动第 ${data.streakDays} 天`
    const w = 84 + estTextWidth(text, 32) + 30
    badge = `<g><rect x="${PAD}" y="1082" width="${Math.round(w)}" height="56" rx="28" fill="url(#badgeGrad)" stroke="#bfe6cf"/>
<circle cx="102" cy="1110" r="9" fill="${PRIMARY_LIGHT}"/>
<text x="126" y="1119" font-family="${FONT}" font-size="32" font-weight="800" fill="${PRIMARY_DARK}">${escapeXml(text)}</text></g>`
  }

  return svgRoot(`${band}${grid}${badge}${footer(data.date.short)}`)
}

function heroDuration(data: WorkoutCardData): string {
  if (data.duration.kind === 'minutes') {
    return `<text x="${PAD}" y="568" font-family="${FONT}" font-size="192" font-weight="800" fill="#ffffff">${data.duration.minutes}<tspan dx="8" font-size="51" font-weight="700" fill="#eafff2">分钟</tspan></text>`
  }
  return `<text x="${PAD}" y="568" font-family="${FONT}" font-size="150" font-weight="800" fill="#ffffff">${data.duration.hours}<tspan dx="6" font-size="57" font-weight="700" fill="#eafff2">小时</tspan><tspan dx="14">${data.duration.minutes}</tspan><tspan dx="6" font-size="57" font-weight="700" fill="#eafff2">分</tspan></text>`
}

/* ---------------- 卡 B · 单组高光卡（R2） ---------------- */

export function setCardSvg(data: SetCardData): string {
  const chars = [...data.nameZh]
  let nameFont = 75
  let nameLines = [data.nameZh]
  if (chars.length > 12) {
    nameFont = 58
    const mid = Math.ceil(chars.length / 2)
    nameLines = [chars.slice(0, mid).join(''), chars.slice(mid).join('')]
  } else if (chars.length > 8) {
    nameFont = 60
  }
  const bandBottom = nameLines.length === 2 ? 424 : 340
  const nameSvg = nameLines
    .map(
      (line, i) =>
        `<text x="${PAD}" y="${196 + i * 74}" font-family="${FONT}" font-size="${nameFont}" font-weight="800" fill="#ffffff"${fitAttrs(line, nameFont, RIGHT - PAD)}>${escapeXml(line)}</text>`,
    )
    .join('')
  const enY = 196 + (nameLines.length - 1) * 74 + 54
  // 星图与 A 卡共用同一组件：v2 板 B 小样注「不叠 motif」，但 Edward 真机截图
  // 明确判 B 卡带右半部是纯绿空带——以真机定版为准，头部带同样带星图（裁剪在带形内、文字在其上）。
  const band = `<clipPath id="bandClipB"><polygon points="0,0 ${CARD_WIDTH},0 ${CARD_WIDTH},${bandBottom - 30} 0,${bandBottom}"/></clipPath>
<polygon points="0,0 ${CARD_WIDTH},0 ${CARD_WIDTH},${bandBottom - 30} 0,${bandBottom}" fill="url(#bandGrad)"/>
<g clip-path="url(#bandClipB)">${bandMotif(770, 4, 1.15)}</g>
<text x="${PAD}" y="112" font-family="${FONT}" font-size="27" font-weight="700" letter-spacing="8.6" fill="${BAND_KICKER}">SET HIGHLIGHT</text>
${nameSvg}
<text x="${PAD}" y="${enY}" font-family="${FONT}" font-size="27" font-weight="700" letter-spacing="7.6" fill="${MINT_PALE}"${fitAttrs(data.nameEn, 27, RIGHT - PAD, 7.6)}>${escapeXml(data.nameEn)}</text>`

  const footNote = data.setIndex != null ? `SET ${String(data.setIndex).padStart(2, '0')} · ${data.date.short}` : data.date.short
  return svgRoot(`${band}${data.scored ? scoredBody(data, bandBottom) : unscoredBody(data, bandBottom)}${footer(footNote)}`)
}

interface Chip {
  pre: string
  val?: string
  post?: string
}

function chipsSvg(chips: Chip[], y: number): string {
  let x = PAD
  const parts: string[] = []
  for (const chip of chips) {
    const text = `${chip.pre}${chip.val || ''}${chip.post || ''}`
    const w = Math.round(estTextWidth(text, 32) + 56)
    const valSvg = chip.val
      ? `<tspan font-weight="800" fill="${PRIMARY_DARK}">${escapeXml(chip.val)}</tspan>`
      : ''
    parts.push(
      `<g><rect x="${x}" y="${y}" width="${w}" height="62" rx="31" fill="${SOFT}" stroke="${LINE}"/><text x="${x + 28}" y="${y + 41}" font-family="${FONT}" font-size="32" font-weight="700" fill="${INK}">${escapeXml(chip.pre)}${valSvg}${escapeXml(chip.post || '')}</text></g>`,
    )
    x += w + 24
  }
  return parts.join('')
}

function scoredBody(data: SetCardData, bandBottom: number): string {
  const scoreText = String(data.score ?? 0)
  const scoreBaseline = bandBottom + 240
  const ofX = PAD + estTextWidth(scoreText, 246) + 26
  const chips: Chip[] = [{ pre: '完成 ', val: String(data.reps), post: ` ${data.unit}` }]
  if (data.setIndex != null) chips.push({ pre: '第 ', val: String(data.setIndex), post: ' 组' })
  if (data.personalBest) chips.push({ pre: '个人最佳' })
  const chipsY = scoreBaseline + 54
  const axesTop = chipsY + 62 + 88
  const axes = (data.axes || [])
    .map((axis, i) => {
      const y = axesTop + i * 92
      const fillW = Math.round(672 * Math.min(100, Math.max(0, axis.value)) / 100)
      return `<text x="${PAD}" y="${y + 10}" font-family="${FONT}" font-size="32" font-weight="700" fill="${INK}">${escapeXml(axis.label)}</text>
<rect x="216" y="${y - 11}" width="672" height="21" rx="10.5" fill="${SOFT}"/>
<rect x="216" y="${y - 11}" width="${fillW}" height="21" rx="10.5" fill="url(#axisGrad)"/>
<text x="${RIGHT}" y="${y + 11}" text-anchor="end" font-family="${FONT}" font-size="33" font-weight="800" fill="${INK}">${axis.value}</text>`
    })
    .join('')
  return `<text x="${PAD}" y="${scoreBaseline}" font-family="${FONT}" font-size="246" font-weight="800" fill="${PRIMARY}">${escapeXml(scoreText)}</text>
<text x="${Math.round(ofX)}" y="${scoreBaseline - 16}" font-family="${FONT}" font-size="39" font-weight="700" fill="${MUTED}">/ 100 · 本组得分</text>
${chipsSvg(chips, chipsY)}
${axes}`
}

function unscoredBody(data: SetCardData, bandBottom: number): string {
  const chips: Chip[] = []
  if (data.setIndex != null) chips.push({ pre: '第 ', val: String(data.setIndex), post: ' 组' })
  // 未评分版式内容少：内容块（标签→主数字→说明→chip）在「带底→落款线 1180」区间内
  // 垂直居中，上下留白对称，主数字放大到 300——纯版式平衡，不加任何数据元素。
  // 原版式内容全挤在上半部，说明文字下方留 408px 连续空白（真机截图反馈）。
  const numFont = 300
  const numCap = Math.round(numFont * 0.72)
  const blockH = 30 + 56 + numCap + 64 + 38 + (chips.length ? 44 + 62 : 0)
  const topPad = Math.max(48, Math.round((1180 - bandBottom - blockH) / 2))
  const labelY = bandBottom + topPad + 30
  const numBaseline = labelY + 56 + numCap
  const noteY = numBaseline + 64 + 38
  return `<text x="${PAD}" y="${labelY}" font-family="${FONT}" font-size="30" font-weight="700" letter-spacing="5.4" fill="${MUTED}">本组完成次数</text>
<text x="${PAD}" y="${numBaseline}" font-family="${FONT}" font-size="${numFont}" font-weight="800" fill="${INK}">${data.reps}<tspan dx="12" font-size="84" font-weight="700" fill="${MUTED}">${escapeXml(data.unit)}</tspan></text>
<text x="${PAD}" y="${noteY}" font-family="${FONT}" font-size="36" fill="${MUTED}">本组未评分，下次把全身放进画面试试</text>
${chips.length ? chipsSvg(chips, noteY + 44) : ''}`
}

/* ---------------- 卡 C · 里程碑卡（R2） ---------------- */

export function milestoneCardSvg(data: MilestoneCardData): string {
  const cx = 540
  const cy = 622
  const r = 272
  const circumference = 2 * Math.PI * r
  const fraction = Math.min(1, Math.max(0, data.fraction))
  const offset = (circumference * (1 - fraction)).toFixed(1)

  const pillText = data.pill
  const pillW = Math.round(estTextWidth(pillText, 30, 4.2) + 68)
  const pill = `<g><rect x="${cx - pillW / 2}" y="212" width="${pillW}" height="62" rx="31" fill="${PRIMARY}"/>
<text x="${cx}" y="253" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="800" letter-spacing="4.2" fill="#ffffff">${escapeXml(pillText)}</text></g>`

  const digitCount = [...data.num.replace(/\D/g, '')].length
  const numFont = digitCount > 3 ? 156 : 222
  const unitFont = digitCount > 3 ? 44 : 57
  const numBaseline = cy + Math.round(numFont * 0.35)
  // 数字与单位分开定位再整体居中：不依赖 text-anchor 对变字号 tspan 的居中实现，跨渲染器结果一致。
  const numW = estTextWidth(data.num, numFont)
  const unitW = data.unit ? estTextWidth(data.unit, unitFont) + 4 : 0
  const numX = Math.round(cx - (numW + unitW) / 2)
  const num = `<text x="${numX}" y="${numBaseline}" font-family="${FONT}" font-size="${numFont}" font-weight="800" fill="${INK}">${escapeXml(data.num)}</text>${
    data.unit
      ? `<text x="${Math.round(numX + numW + 4)}" y="${numBaseline}" font-family="${FONT}" font-size="${unitFont}" font-weight="700" fill="${MUTED}">${escapeXml(data.unit)}</text>`
      : ''
  }`

  const subChars = [...data.sub]
  let sub: string
  if (subChars.length > 9) {
    const mid = Math.ceil(subChars.length / 2)
    const lines = [subChars.slice(0, mid).join(''), subChars.slice(mid).join('')]
    sub = lines
      .map(
        (line, i) =>
          `<text x="${cx}" y="${numBaseline + 56 + i * 44}" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="700" letter-spacing="6" fill="${MUTED}"${fitAttrs(line, 30, 400, 6)}>${escapeXml(line)}</text>`,
      )
      .join('')
  } else {
    sub = `<text x="${cx}" y="${numBaseline + 74}" text-anchor="middle" font-family="${FONT}" font-size="33" font-weight="700" letter-spacing="6.6" fill="${MUTED}"${fitAttrs(data.sub, 33, 420, 6.6)}>${escapeXml(data.sub)}</text>`
  }

  const line = (segments: MilestoneCardData['line1'], y: number) =>
    `<text x="${cx}" y="${y}" text-anchor="middle" font-family="${FONT}" font-size="38" fill="${MUTED}">${segments
      .map((s) => (s.b ? `<tspan font-weight="700" fill="${INK}">${escapeXml(s.t)}</tspan>` : `<tspan>${escapeXml(s.t)}</tspan>`))
      .join('')}</text>`

  return svgRoot(`${brandRow({ dark: false, dateText: data.date.short })}
<line x1="${PAD}" y1="176" x2="${RIGHT}" y2="176" stroke="${LINE}" stroke-width="1"/>
${pill}
<circle cx="${cx}" cy="${cy + 12}" r="${r}" fill="none" stroke="${PRIMARY_LIGHT}" stroke-width="30" opacity="0.16" filter="url(#ringShadow)"/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${MINT}" stroke-width="30"/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${PRIMARY_LIGHT}" stroke-width="30" stroke-linecap="round" stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${offset}" transform="rotate(-90 ${cx} ${cy})"/>
${num}
${sub}
${line(data.line1, 1012)}
${line(data.line2, 1076)}
${footer(data.foot)}`)
}
