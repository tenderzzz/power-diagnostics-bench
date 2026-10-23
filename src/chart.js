import { lowerBound } from './core.js';

export const VIEWS = { full: [0, 0.012], transient: [0.0018, 0.0038], ripple: [0.0018, 0.0019] };
const colors = { ink: '#2d3349', muted: '#606966', grid: '#dce0d3', teal: '#28736f', copper: '#9b5439', before: '#8c9086' };

function extent(trace, key, start, end) {
  let min = Infinity, max = -Infinity;
  for (let i = Math.max(0, lowerBound(trace.t, start) - 1); i < trace.t.length && trace.t[i] <= end; i++) {
    min = Math.min(min, trace[key][i]); max = Math.max(max, trace[key][i]);
  }
  return [min, max];
}

function niceRange(min, max, fine = false) {
  const padding = Math.max((max - min) * 0.14, fine ? 0.003 : 0.04);
  const span = max - min + 2 * padding;
  const rawStep = span / 4, power = 10 ** Math.floor(Math.log10(rawStep));
  const ratio = rawStep / power, step = (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10) * power;
  return [Math.floor((min - padding) / step) * step, Math.ceil((max + padding) / step) * step];
}

/** Keep every pixel's extrema in chronological order; ripple peaks survive downsampling. */
export function envelopeIndices(trace, key, start, end, pixels) {
  const out = [], lo = Math.max(0, lowerBound(trace.t, start) - 1), hi = Math.min(trace.t.length - 1, lowerBound(trace.t, end));
  let bin = -1, first = lo, last = lo, min = lo, max = lo;
  const flush = () => { for (const i of [...new Set([first, min, max, last])].sort((a,b) => a-b)) out.push(i); };
  for (let i = lo; i <= hi; i++) {
    const next = Math.floor((trace.t[i] - start) / (end - start) * pixels);
    if (next !== bin) {
      if (bin !== -1) flush();
      bin = next; first = min = max = i;
    }
    last = i;
    if (trace[key][i] < trace[key][min]) min = i;
    if (trace[key][i] > trace[key][max]) max = i;
  }
  flush(); return out;
}

export function drawWave(canvas, result, options) {
  if (!result || !canvas.clientWidth) return;
  const { probe, view, cursor, before, t } = options;
  const width = canvas.clientWidth, height = canvas.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
  const left = 43, right = width - 12, top = 24, upperEnd = Math.round(height * 0.57), lowerTop = upperEnd + 29, bottom = height - 24;
  const [start, end] = VIEWS[view], plotWidth = right - left;
  const x = time => left + (time - start) / (end - start) * plotWidth;
  const secondary = probe === 'vout' ? null : probe;
  let [vmin, vmax] = extent(result.trace, 'vout', start, end);
  if (before) { const e = extent(before.trace, 'vout', start, end); vmin = Math.min(vmin, e[0]); vmax = Math.max(vmax, e[1]); }
  if (view !== 'ripple') { vmin = Math.min(vmin, 4.75); vmax = Math.max(vmax, 5.25); }
  const vrange = niceRange(vmin, vmax, view === 'ripple');
  let srange = [0, 1];
  if (secondary) {
    let [a, b] = extent(result.trace, secondary, start, end);
    if (before) { const old = extent(before.trace, secondary, start, end); a = Math.min(a, old[0]); b = Math.max(b, old[1]); }
    if (secondary === 'sw') { a = 0; b = 12; }
    srange = niceRange(a, b);
  }
  const yV = v => upperEnd - (v - vrange[0]) / (vrange[1] - vrange[0]) * (upperEnd - top);
  const yS = v => bottom - (v - srange[0]) / (srange[1] - srange[0]) * (bottom - lowerTop);
  ctx.fillStyle = '#f3f4ea'; ctx.fillRect(0, 0, width, height);
  ctx.save(); ctx.beginPath(); ctx.rect(left, top, plotWidth, upperEnd - top); ctx.clip();
  ctx.fillStyle = '#4c9e9a0d'; ctx.fillRect(left, yV(5.25), plotWidth, yV(4.75) - yV(5.25));
  if (result.config.excitation && view !== 'ripple') {
    ctx.fillStyle = '#9b543907'; ctx.fillRect(x(0.002), top, x(0.006) - x(0.002), upperEnd - top);
  }
  ctx.restore();
  ctx.font = '9px ui-monospace, monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const [range, y, a, b] of [[vrange,yV,top,upperEnd],[srange,yS,lowerTop,bottom]]) {
    for (let i = 0; i <= 2; i++) {
      const value = range[0] + (range[1] - range[0]) * i / 2, py = y(value);
      ctx.strokeStyle = colors.grid; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(right, py); ctx.stroke();
      ctx.fillStyle = colors.muted;
      const digits = range[1] - range[0] < 0.1 ? 3 : range[1] - range[0] < 1 ? 2 : 1;
      if (a === top || secondary) ctx.fillText(value.toFixed(digits), left - 7, py);
    }
  }
  const divisions = width < 400 ? 4 : 6;
  for (let i = 0; i <= divisions; i++) {
    const px = left + plotWidth * i / divisions;
    ctx.strokeStyle = colors.grid; ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, upperEnd); ctx.moveTo(px, lowerTop); ctx.lineTo(px, bottom); ctx.stroke();
    ctx.textAlign = i === 0 ? 'left' : i === divisions ? 'right' : 'center'; ctx.fillStyle = colors.muted;
    const value = (start + (end - start) * i / divisions) * (view === 'ripple' ? 1e6 : 1e3);
    ctx.fillText(value.toFixed(view === 'transient' ? 1 : 0), px, height - 10);
  }
  ctx.textAlign = 'left'; ctx.fillStyle = colors.teal; ctx.font = '10px ui-monospace, monospace'; ctx.fillText('Vout / V', left, 12);
  ctx.fillStyle = colors.copper;
  const symbol = { vin:'Vin / V', il:'IL / A', iout:'Iload / A', sw:'SW / V' }[secondary];
  ctx.fillText(symbol || '—', left, lowerTop - 12);
  ctx.textAlign = 'right'; ctx.fillStyle = colors.muted; ctx.font = '9px ui-monospace, monospace'; ctx.fillText(view === 'ripple' ? 'µs' : 'ms', right, 12);
  if (!secondary) { ctx.textAlign = 'center'; ctx.font = '10px sans-serif'; ctx.fillText(t.waitingSignal, (left + right) / 2, (lowerTop + bottom) / 2); }
  ctx.save(); ctx.beginPath(); ctx.rect(left, top, plotWidth, upperEnd - top); ctx.clip();
  ctx.strokeStyle = '#4c9e9a70'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(left, yV(5)); ctx.lineTo(right, yV(5)); ctx.stroke(); ctx.restore();
  const line = (r, key, y, a, b, color, dashed = false) => {
    ctx.save(); ctx.beginPath(); ctx.rect(left, a, plotWidth, b - a); ctx.clip();
    ctx.strokeStyle = color; ctx.lineWidth = dashed ? 1.15 : 1.5; ctx.setLineDash(dashed ? [4, 3] : []); ctx.beginPath();
    const indices = envelopeIndices(r.trace, key, start, end, plotWidth * 1.5);
    indices.forEach((i,j) => { const px=x(r.trace.t[i]),py=y(r.trace[key][i]); if(j)ctx.lineTo(px,py);else ctx.moveTo(px,py); });
    ctx.stroke(); ctx.restore();
  };
  if (before) { line(before, 'vout', yV, top, upperEnd, colors.before, true); if (secondary) line(before, secondary, yS, lowerTop, bottom, '#aaa693', true); }
  line(result, 'vout', yV, top, upperEnd, colors.teal);
  if (secondary) line(result, secondary, yS, lowerTop, bottom, colors.copper);
  if (result.config.excitation && view !== 'ripple') for (const time of [0.002, 0.006]) {
    if (time < start || time > end) continue;
    ctx.save(); ctx.setLineDash([2,4]); ctx.strokeStyle = '#9b54394a'; ctx.beginPath();ctx.moveTo(x(time),top);ctx.lineTo(x(time),bottom);ctx.stroke();ctx.restore();
  }
  const cx = x(Math.max(start,Math.min(end,cursor)));
  ctx.strokeStyle = '#2d33496e';ctx.lineWidth = .8;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(cx,top);ctx.lineTo(cx,bottom);ctx.stroke();ctx.setLineDash([]);
  return { left, right, start, end };
}
