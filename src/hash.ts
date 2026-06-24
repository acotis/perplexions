// djb2-style string hash. Used both to seed the daily level color and to derive
// the shareable emoji "solution hash". Its output must stay stable forever:
// changing it would silently change every player's shared results and colors.
export function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
}
