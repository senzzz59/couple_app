/** 收藏的排前面，最多 4 张；同一类里隔几张取一张，封面别都是连拍的同一个场景 */
export function pickCovers(favs: string[], rest: string[], n = 4) {
  const spread = (xs: string[], k: number) => (xs.length <= k ? xs : Array.from({ length: k }, (_, i) => xs[Math.floor((i * xs.length) / k)]));
  const f = spread(favs, n);
  return [...f, ...spread(rest, n - f.length)];
}
