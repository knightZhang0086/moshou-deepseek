/**
 * 全局视觉主题：先秦木牍 / 竹简 / 墨色。
 * 背景羊皮纸质感、主墨色、红蓝双方色、金色点缀。
 */
import type { Side } from '@moshou/engine';

export const C = {
  bg: '#f4ead6',
  bgDeep: '#eadfc4',
  paper: '#fbf6ea',
  ink: '#2b241c',
  inkSoft: '#6b5a41',
  inkFaint: '#9c8b6e',
  red: '#b23a2e',
  redDark: '#7c2419',
  redSoft: '#e6b6a8',
  blue: '#2f5f8f',
  blueDark: '#1d3f61',
  blueSoft: '#a8c0d6',
  gold: '#c9962e',
  goldSoft: '#e8d9b0',
  green: '#5c7a4a',
  danger: '#8f3a2e',
  line: 'rgba(43, 36, 28, 0.25)',
} as const;

export const FONT = `'Kaiti SC','STKaiti','KaiTi','FangSong','SimSun',serif`;

export function sideColor(side: Side): string {
  return side === 'red' ? C.red : C.blue;
}

export function sideSoftColor(side: Side): string {
  return side === 'red' ? C.redSoft : C.blueSoft;
}

export function sideDarkColor(side: Side): string {
  return side === 'red' ? C.redDark : C.blueDark;
}
