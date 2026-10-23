/** Generic forced-PWM synchronous Buck. All internal values use SI units. */
export const MODEL_VERSION = 'buck-switching-1.0.0';
export const DEFAULTS = Object.freeze({
  vin: 12, target: 5, frequency: 100000, inductance: 100e-6,
  capacitance: 470e-6, esr: 0.04, dcr: 0.08,
  baseLoad: 1, pulseLoad: 1.5, sagVoltage: 12,
  eventStart: 0.002, eventEnd: 0.006, duration: 0.012, warmup: 0.015,
  subdivisions: 50, excitation: true,
});

export function createConfig(kind = 'healthy') {
  const c = { ...DEFAULTS };
  if (kind === 'input') c.sagVoltage = 9;
  else if (kind === 'load') c.pulseLoad = 2;
  else if (kind === 'capacitor') { c.capacitance = 100e-6; c.esr = 0.18; }
  else if (kind !== 'healthy') throw new Error('Unknown preset');
  return c;
}

export function validateConfig(input) {
  const c = { ...DEFAULTS, ...input };
  for (const key of Object.keys(DEFAULTS)) {
    if (key === 'excitation') continue;
    if (!Number.isFinite(c[key])) throw new Error(`Invalid ${key}`);
  }
  if (c.vin !== 12 || c.target !== 5 || c.frequency !== 100000 || c.inductance !== 100e-6 || c.dcr !== 0.08)
    throw new Error('This model version has a fixed 12 V / 5 V power stage');
  if (c.capacitance < 100e-6 || c.capacitance > 680e-6 || c.esr < 0.02 || c.esr > 0.25)
    throw new Error('Capacitor parameters are outside the supported range');
  if (c.sagVoltage < 8 || c.sagVoltage > 12 || c.baseLoad !== 1 || c.pulseLoad < 1.5 || c.pulseLoad > 3)
    throw new Error('Input or load parameters are outside the supported range');
  if (![50, 100, 200].includes(c.subdivisions)) throw new Error('Unsupported integration resolution');
  if (c.eventStart !== 0.002 || c.eventEnd !== 0.006 || c.duration !== 0.012 || c.warmup !== 0.015)
    throw new Error('This lesson uses a fixed timing sequence');
  if (typeof c.excitation !== 'boolean') throw new Error('Invalid excitation flag');
  return c;
}

/** State derivatives for one switch state, also exposed for independent checks. */
export function derivatives(il, vc, switchState, vin, load, c) {
  const vout = vc + c.esr * (il - load);
  return [(switchState * vin - vout - c.dcr * il) / c.inductance,
    (il - load) / c.capacitance];
}

export function simulate(input = {}) {
  const c = validateConfig(input), ts = 1 / c.frequency;
  const warmCycles = Math.round(c.warmup / ts), count = Math.round(c.duration / ts);
  const start = Math.round(c.eventStart / ts), end = Math.round(c.eventEnd / ts);
  const trace = { t: [], vout: [], vin: [], il: [], iout: [], sw: [], duty: [] };
  const cycles = { t: [], vout: [], il: [], duty: [] };
  let il = c.baseLoad, vc = c.target, avgV = c.target, avgI = c.baseLoad;
  let integral = 1.08;

  for (let cycle = -warmCycles; cycle < count; cycle++) {
    const active = c.excitation && cycle >= start && cycle < end;
    const vin = active ? c.sagVoltage : c.vin, load = active ? c.pulseLoad : c.baseLoad;
    // Sampled voltage PI with inductor-current feedback. No measured load feed-forward.
    const error = c.target - avgV;
    const raw = (c.target + 0.8 * error + integral - avgI) / c.vin;
    const duty = Math.max(0.02, Math.min(0.95, raw));
    if ((raw >= 0.02 && raw <= 0.95) || (raw > 0.95 && error < 0) || (raw < 0.02 && error > 0))
      integral += 4000 * error * ts;
    let sumV = 0, sumI = 0;
    const push = (time, q) => {
      if (cycle < 0) return;
      trace.t.push(time); trace.vout.push(vc + c.esr * (il - load));
      trace.vin.push(vin); trace.il.push(il); trace.iout.push(load);
      trace.sw.push(q * vin); trace.duty.push(duty);
    };
    // Integrate ON and OFF separately, landing exactly at both PWM edges.
    for (let q = 1; q >= 0; q--) {
      const offset = q ? 0 : ts * duty, duration = ts * (q ? duty : 1 - duty);
      const steps = Math.max(1, Math.ceil(c.subdivisions * duration / ts)), h = duration / steps;
      push(cycle * ts + offset, q);
      for (let j = 0; j < steps; j++) {
        const a = derivatives(il, vc, q, vin, load, c);
        const b = derivatives(il + h * a[0] / 2, vc + h * a[1] / 2, q, vin, load, c);
        const d = derivatives(il + h * b[0] / 2, vc + h * b[1] / 2, q, vin, load, c);
        const e = derivatives(il + h * d[0], vc + h * d[1], q, vin, load, c);
        il += h * (a[0] + 2 * b[0] + 2 * d[0] + e[0]) / 6;
        vc += h * (a[1] + 2 * b[1] + 2 * d[1] + e[1]) / 6;
        const vout = vc + c.esr * (il - load);
        sumV += vout * h / ts; sumI += il * h / ts;
        push(cycle * ts + offset + (j + 1) * h, q);
      }
    }
    avgV = sumV; avgI = sumI;
    if (!Number.isFinite(avgV) || !Number.isFinite(avgI)) throw new Error('Simulation did not converge');
    if (cycle >= 0) { cycles.t.push((cycle + 0.5) * ts); cycles.vout.push(avgV); cycles.il.push(avgI); cycles.duty.push(duty); }
  }
  for (const key of Object.keys(trace)) trace[key] = Float64Array.from(trace[key]);
  for (const key of Object.keys(cycles)) cycles[key] = Float64Array.from(cycles[key]);
  const result = { version: MODEL_VERSION, config: c, trace, cycles };
  result.metrics = extractMetrics(result);
  return result;
}

export function rangeStats(trace, key, start, end) {
  let min = Infinity, max = -Infinity, sum = 0, count = 0;
  const lo = lowerBound(trace.t, start), hi = lowerBound(trace.t, end);
  for (let i = lo; i < hi; i++) {
    const value = trace[key][i]; min = Math.min(min, value); max = Math.max(max, value); sum += value; count++;
  }
  return { min, max, mean: count ? sum / count : NaN, count };
}

export function extractMetrics(result) {
  const { trace, cycles, config: c } = result;
  const event = rangeStats(trace, 'vout', c.eventStart, c.eventEnd);
  const ripple = rangeStats(trace, 'vout', 0.0015, 0.0019);
  const input = rangeStats(trace, 'vin', c.eventStart, c.eventEnd);
  const load = rangeStats(trace, 'iout', c.eventStart, c.eventEnd);
  const release = rangeStats(trace, 'vout', c.eventEnd, c.duration);
  let lastOutside = -1;
  const begin = lowerBound(cycles.t, c.eventStart), end = lowerBound(cycles.t, c.eventEnd);
  for (let i = begin; i < end; i++) if (Math.abs(cycles.vout[i] - c.target) > c.target * 0.02) lastOutside = i;
  const recovery = lastOutside === -1 ? 0 : lastOutside + 1 < end
    ? cycles.t[lastOutside + 1] - c.eventStart : null;
  const steady = rangeStats(cycles, 'vout', 0.011, 0.012);
  return { minimum: event.min, droop: c.target - event.min, ripple: ripple.max - ripple.min,
    recovery, overshoot: release.max - c.target, inputMinimum: input.min, loadPeak: load.max,
    steadyMean: steady.mean, withinReference: event.min >= c.target * 0.95 && release.max <= c.target * 1.05 };
}

export function lowerBound(array, value) {
  let lo = 0, hi = array.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (array[mid] < value) lo = mid + 1; else hi = mid; }
  return lo;
}

export function sampleAt(trace, time) {
  let i = Math.min(trace.t.length - 1, lowerBound(trace.t, time));
  while (i + 1 < trace.t.length && trace.t[i + 1] === trace.t[i]) i++;
  return Object.fromEntries(Object.keys(trace).map(k => [k, trace[k][i]]));
}

export function applyIntervention(config, action) {
  const next = { ...config };
  if (action === 'input') next.sagVoltage = DEFAULTS.vin;
  else if (action === 'load') next.pulseLoad = DEFAULTS.pulseLoad;
  else if (action === 'capacitor') { next.capacitance = DEFAULTS.capacitance; next.esr = DEFAULTS.esr; }
  else throw new Error('Unknown intervention');
  return next;
}

/** Observations are acquired traces, never the hidden case configuration. */
export function diagnose(observations) {
  const missing = ['vin', 'iout'].filter(k => observations[k] === undefined);
  let supported = null;
  if (observations.vin?.minimum < 11.8) supported = 'input';
  else if (observations.iout?.peak > 1.65) supported = 'load';
  else if (!missing.length && observations.vout &&
    (observations.vout.ripple > 0.025 || observations.vout.minimum < 4.75)) supported = 'capacitor';
  return { supported, sufficient: !missing.length && supported !== null,
    next: missing[0] || (!supported ? 'il' : null), missing };
}

export function observationFor(result, probe) {
  const m = result.metrics;
  if (probe === 'vin') return { minimum: m.inputMinimum, nominal: 12 };
  if (probe === 'iout') return { peak: m.loadPeak, expected: 1.5 };
  if (probe === 'vout') return { minimum: m.minimum, ripple: m.ripple, recovery: m.recovery };
  if (probe === 'il') return rangeStats(result.trace, 'il', 0.002, 0.006);
  if (probe === 'sw') return rangeStats(result.trace, 'duty', 0.002, 0.006);
  throw new Error('Unknown probe');
}

export function waveformCSV(result) {
  const keys = ['t', 'vout', 'vin', 'il', 'iout', 'sw', 'duty'];
  const rows = ['time_s,vout_V,vin_V,inductor_A,load_A,switch_V,duty_ratio'];
  for (let i = 0; i < result.trace.t.length; i++) rows.push(keys.map(k => result.trace[k][i].toPrecision(10)).join(','));
  return rows.join('\n');
}
