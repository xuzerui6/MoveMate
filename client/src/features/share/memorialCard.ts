/**
 * 这一局的纪念卡（SVG）—— 跟着产品分享卡的视觉语言：白底、品牌绿带。
 * 卡上只有自己的数据：项目 / 时间 / 场地 / 一起运动的人数 / 我运动了多久 / 我得到的经验值。
 * 不带队友的头像、名字和成绩。
 */
import { CARD_HEIGHT, CARD_WIDTH, escapeXml } from './cardSvg';
import type { EndSummary } from '../../types';

const FONT = `-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif`;
const PRIMARY_DARK = '#08783b';
const INK = '#080b09';
const MUTED = '#68767e';
const LINE = '#e3e9e6';
const PAD = 72;
const RIGHT = CARD_WIDTH - PAD;

export function memorialCardSvg(summary: EndSummary, fields: { label: string; value: string }[]): string {
  const rows = fields
    .map((f, i) => {
      const y = 560 + i * 108;
      return `${i > 0 ? `<line x1="${PAD}" y1="${y - 64}" x2="${RIGHT}" y2="${y - 64}" stroke="${LINE}" stroke-width="1"/>` : ''}
<text x="${PAD}" y="${y}" font-family="${FONT}" font-size="34" fill="${MUTED}">${escapeXml(f.label)}</text>
<text x="${RIGHT}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="40" font-weight="700" fill="${INK}">${escapeXml(f.value)}</text>`;
    })
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
<defs><linearGradient id="memorialBand" x1="0" y1="0" x2="1" y2="0.28"><stop offset="0" stop-color="#08783b"/><stop offset=".52" stop-color="#008a40"/><stop offset="1" stop-color="#00c65e"/></linearGradient></defs>
<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="#ffffff"/>
<polygon points="0,0 ${CARD_WIDTH},0 ${CARD_WIDTH},380 0,428" fill="url(#memorialBand)"/>
<text x="${PAD}" y="128" font-family="${FONT}" font-size="36" font-weight="800" fill="#ffffff">动伴<tspan dx="10" font-size="32" font-weight="600" fill="#c9f5da">MoveMate</tspan></text>
<text x="${PAD}" y="238" font-family="${FONT}" font-size="30" font-weight="600" letter-spacing="4" fill="#b6ffd2">这一局 · 纪念卡</text>
<text x="${PAD}" y="322" font-family="${FONT}" font-size="64" font-weight="800" fill="#ffffff">这一局，练完啦</text>
${rows}
<line x1="${PAD}" y1="1180" x2="${RIGHT}" y2="1180" stroke="${LINE}" stroke-width="1"/>
<text x="${PAD}" y="1236" font-family="${FONT}" font-size="39" font-weight="800" letter-spacing="2.3" fill="${PRIMARY_DARK}">每次运动，都算数。</text>
<text x="${PAD}" y="1276" font-family="${FONT}" font-size="26" font-weight="600" letter-spacing="3.6" fill="${MUTED}">MOVEMATE · 动伴</text>
<text x="${RIGHT}" y="1276" text-anchor="end" font-family="${FONT}" font-size="26" font-weight="600" fill="${MUTED}">这张卡上只有我自己的数据</text>
</svg>`;
}
