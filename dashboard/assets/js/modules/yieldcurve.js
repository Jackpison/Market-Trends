import { CURVES, MATURITIES } from './data.js';
import { cssVar, onThemeChange, chartDefaults } from './theme.js';

let chart, t = CURVES.length - 1, playing = false, raf, last = 0;
const ease = (x) => x * x * (3 - 2 * x);

function curveAt(pos) {
  const a = Math.min(Math.floor(pos), CURVES.length - 1), b = Math.min(a + 1, CURVES.length - 1);
  const f = ease(pos - a);
  return CURVES[a].y.map((v, k) => v + (CURVES[b].y[k] - v) * f);
}

function draw() {
  const y = curveAt(t);
  const s2s10 = (y[7] - y[3]) * 100, s3m10 = (y[7] - y[0]) * 100;
  const inv = s2s10 < 0 || s3m10 < 0;
  const col = inv ? cssVar('--red') : cssVar('--green');
  const ds = chart.data.datasets[0];
  ds.data = y; ds.borderColor = col; ds.backgroundColor = col + '22'; ds.pointBackgroundColor = col;
  chart.update('none');
  const nearest = CURVES[Math.min(Math.round(t), CURVES.length - 1)];
  document.getElementById('yc-label').textContent = nearest.label;
  const set = (id, v) => { const e = document.getElementById(id); e.textContent = `${v >= 0 ? '+' : ''}${v.toFixed(0)}bp`; e.className = v < 0 ? 'red-t' : 'green-t'; };
  set('yc-2s10', s2s10); set('yc-3m10', s3m10);
  document.getElementById('yc-slider').value = t;
}

function loop(ts) {
  if (!playing) return;
  if (ts - last > 16) { t += 0.012; last = ts; if (t > CURVES.length - 1) t = 0; draw(); }
  raf = requestAnimationFrame(loop);
}

function setPlaying(p) {
  playing = p;
  document.getElementById('yc-play').textContent = p ? '❚❚ Pause' : '▶ Play history';
  cancelAnimationFrame(raf);
  if (p) { if (t >= CURVES.length - 1) t = 0; raf = requestAnimationFrame(loop); }
}

export function initYield() {
  chartDefaults();
  chart = new Chart(document.getElementById('ycChart'), {
    type: 'line',
    data: { labels: MATURITIES, datasets: [{ label: 'Treasury yield (%)', data: [], borderWidth: 3, tension: 0.35, fill: true, pointRadius: 4 }] },
    options: {
      maintainAspectRatio: false, animation: false,
      scales: { y: { min: 0, max: 6, title: { display: true, text: 'Yield %' }, grid: { color: cssVar('--border') } }, x: { grid: { color: cssVar('--border') } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.parsed.y.toFixed(2)}%` } } },
    },
  });
  const sl = document.getElementById('yc-slider');
  sl.max = CURVES.length - 1; sl.step = 0.01;
  sl.addEventListener('input', () => { setPlaying(false); t = +sl.value; draw(); });
  document.getElementById('yc-play').addEventListener('click', () => setPlaying(!playing));
  onThemeChange(() => {
    chart.options.scales.y.grid.color = chart.options.scales.x.grid.color = cssVar('--border');
    draw();
  });
  draw();
}
