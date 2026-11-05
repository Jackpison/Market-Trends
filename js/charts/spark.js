export function spark(points, color = 'var(--accent)', w = 96, h = 24) {
  if (!points || points.length < 2) return '';
  const v = points.map(p => p[1]), lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1;
  const d = v.map((x, i) => `${(i / (v.length - 1) * w).toFixed(1)},${(h - 2 - (x - lo) / r * (h - 4)).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><polyline points="${d}" fill="none" stroke="${color}" stroke-width="1.5"/></svg>`;
}
