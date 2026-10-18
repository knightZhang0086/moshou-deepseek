/**
 * 行动日志的中文描述。
 * 位置显示：'H3,4' → 「横三·四」，'V2,5' → 「竖二·五」。
 * 数字：0→〇 1→一 … 9→九。
 */
import { CARDS, parseCellKey, type Action, type Side } from '@moshou/engine';

const CN = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;

export function cnNum(n: number): string {
  if (Number.isInteger(n) && n >= 0 && n <= 9) return CN[n] ?? String(n);
  return String(n);
}

/** 'H3,4' → 「横三·四」 */
export function cellLabel(key: string): string {
  const c = parseCellKey(key);
  return `${c.d === 'H' ? '横' : '竖'}${cnNum(c.x)}·${cnNum(c.y)}`;
}

export function describeAction(name: string, a: Action): string {
  switch (a.kind) {
    case 'place':
      return `${name} 在 ${cellLabel(a.cell)} 放置木片`;
    case 'convert':
      return `${name} 易械 ${cellLabel(a.cell)}`;
    case 'skill': {
      const def = CARDS[a.card];
      const p = a.params;
      if ('cells' in p && p.cells && p.cells.length > 0) {
        const cells = p.cells.map(cellLabel).join('、');
        return def.kind === 'convertTwo'
          ? `${name} 使用 ${def.name} 易械 ${cells}`
          : `${name} 使用 ${def.name} 放置 ${cells}`;
      }
      if ('from' in p && p.from && p.to) {
        return `${name} 使用 ${def.name} 将 ${cellLabel(p.from)} 移至 ${cellLabel(p.to)}`;
      }
      if ('cell' in p && p.cell) {
        switch (def.kind) {
          case 'remove':
            return `${name} 使用 ${def.name} 拆除 ${cellLabel(p.cell)}`;
          case 'removeAndPlace':
            return `${name} 使用 ${def.name} 拆换 ${cellLabel(p.cell)}`;
          case 'fortify':
            return `${name} 使用 ${def.name} 坚守 ${cellLabel(p.cell)}`;
          default:
            return `${name} 使用 ${def.name} 易械 ${cellLabel(p.cell)}`;
        }
      }
      if (def.kind === 'exhaust') return `${name} 使用 ${def.name}，池 −2`;
      if (def.kind === 'recycle') return `${name} 使用 ${def.name}，弃置区取回两根，池 +1`;
      return `${name} 使用 ${def.name}`;
    }
  }
}

export function winTitle(winner: Side, by: 'path' | 'timeout'): string {
  if (by === 'timeout') return '木片池耗尽';
  return winner === 'red' ? '贯通南北 · 攻破宋城' : '贯通东西 · 守御功成';
}

export function winText(winner: Side, by: 'path' | 'timeout'): string {
  if (by === 'timeout') return '公共木片池耗尽，墨子守成，本小局墨子胜。';
  return winner === 'red'
    ? '公输盘贯通南北，攻破宋城，本小局公输盘胜。'
    : '墨子贯通东西，守御功成，本小局墨子胜。';
}
