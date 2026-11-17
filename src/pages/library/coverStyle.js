import { colors, fonts, type } from './theme.js'

// Kapak/en oranı: defter biçimi
export const BOOK_RATIO = 1.45

// Etiketteki adın boyu: raftaki küçük kapakta gövde, büyük önizlemede başlık boyu
export function coverTitleStyle(width) {
  const fontSize = width >= 160 ? type.title : type.body
  return {
    ...fonts.displayBold,
    fontSize,
    lineHeight: `${fontSize * 1.15}px`,
    textAlign: 'center',
    color: colors.ink,
  }
}
