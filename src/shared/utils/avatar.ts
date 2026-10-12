/**
 * 用户头像（字母圆片）配色：按 key（用户名/ID）散列取色，同一用户颜色稳定。
 */

const AVATAR_TONES = [
  'bg-blue-50 text-blue-600',
  'bg-green-50 text-green-600',
  'bg-amber-50 text-amber-600',
  'bg-violet-50 text-violet-600',
  'bg-rose-50 text-rose-600',
  'bg-cyan-50 text-cyan-600',
];

export const avatarTone = (key: string): string =>
  AVATAR_TONES[[...key].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_TONES.length];

/** 头像字母：昵称/用户名首字符（大写），空值兜底 ? */
export const avatarLetter = (name?: string | null): string =>
  name?.trim().charAt(0).toUpperCase() || '?';
