import { MODEL_VERSION, createConfig, simulate, applyIntervention, diagnose, observationFor, sampleAt, waveformCSV } from './core.js';
import { messages, PROBES, CASES, units, symbols, esc } from './i18n.js';
import { boardMarkup, stepThumb } from './board.js';
import { drawWave, VIEWS } from './chart.js';

const icons = {
  pulse: '<path d="M2 13h5l3-8 4 14 3-6h5"/>',
  book: '<path d="M3 4h7c1.5 0 2 1 2 2v15c0-2-1-3-3-3H3zM21 4h-7c-1.5 0-2 1-2 2v15c0-2 1-3 3-3h6z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3v.1"/>',
  reset: '<path d="M4 10a8 8 0 1 1 .7 6M4 4v6h6"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  close: '<path d="m5 5 14 14M19 5 5 19"/>',
  tool: '<path d="m4 20 9-9m-2-7a6 6 0 0 0 9 9l-4-1-4-4 1-4z"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
let storedLang;
try { storedLang = localStorage.getItem('power-bench-language'); } catch {}
const queryLang = new URLSearchParams(location.search).get('lang');
const state = {
  lang: queryLang === 'en' || queryLang === 'zh' ? queryLang : storedLang === 'en' ? 'en' : 'zh',
  mode: 'learn', step: 0, preset: 'load', config: createConfig('load'), captured: false,
  probe: 'vout', view: 'full', cursor: 0.003, result: null, before: null, observations: {},
  busy: false, request: 0, feedback: null, repair: null, compare: true,
  caseIndex: 0, choice: null, confirmed: false, completed: new Set(), verified: false,
  replaying: false, error: false,
  adjusting: false,
};
let worker, timer, raf, observer, dialogFocus, baselineMetrics, lastFocusKey;
const root = document.querySelector('#app');
const mobileMedia = matchMedia('(max-width:760px)');
const tr = () => messages[state.lang];
const fmt = (n, digits = 2) => Number.isFinite(n) ? n.toFixed(digits) : '—';
const isChallenge = () => state.mode === 'challenge';
const currentKind = () => isChallenge() ? CASES[state.caseIndex] : state.preset;
const repairLabel = kind => tr()[kind + 'Repair'];
const probeLetter = p => ['vin','sw','il','vout','iout'].indexOf(p) + 1;
const originalResult = () => state.before || state.result;

try {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => receive(data);
  worker.onerror = () => { worker?.terminate(); worker = null; calculate(state.before ? applyIntervention(state.config,state.repair) : state.config, false); };
} catch {}

function calculate(config = state.config, resetEvidence = true, keepControls = false) {
  cancelReplay();
  clearTimeout(timer);
  const id = ++state.request, next = { ...config, excitation: state.captured };
  state.busy = true; state.error = false;
  if (resetEvidence) { state.observations = {}; state.feedback = null; state.verified = false; state.choice = null; state.confirmed = false; }
  if (keepControls) syncCalculationUI(); else render();
  timer = setTimeout(() => {
    if (worker) worker.postMessage({ id, config: next });
    else requestAnimationFrame(() => {
      try { baselineMetrics ||= simulate(createConfig('healthy')).metrics; receive({ id, result: simulate(next), baselineMetrics }); } catch (error) { receive({ id, error: error.message }); }
    });
  }, 100);
}

function receive({ id, result, error, baselineMetrics: reference }) {
  if (id !== state.request) return;
  state.busy = false;
  if (error) { state.error = true; render(); return; }
  state.result = result;
  if (reference) baselineMetrics = reference;
  if (state.captured && !state.before) state.observations.vout = observationFor(result, 'vout');
  if (state.repair) {
    const kind = currentKind();
    const sameAsBaseline = baselineMetrics && Math.abs(result.metrics.minimum - baselineMetrics.minimum) < 0.003 && Math.abs(result.metrics.ripple - baselineMetrics.ripple) < 0.001;
    state.verified = state.repair === kind && sameAsBaseline;
    if (isChallenge()) {
      if (state.verified) { state.completed.add(state.caseIndex); state.feedback = 'verified'; }
      else state.feedback = 'wrongRepair';
    } else state.feedback = state.verified ? 'tutorialFixed' : kind === 'healthy' ? 'healthyFix' : 'wrongRepair';
  }
  if (state.adjusting) { syncCalculationUI(); draw(); } else render();
}

// Range controls keep their original DOM nodes throughout a pointer gesture.
function syncCalculationUI() {
  const status=root.querySelector('.scene-status');
  if(status){status.classList.toggle('busy',state.busy);status.innerHTML=`<i class="status-dot"></i>${state.busy?tr().calculating:tr().captured}`;}
  let cover=root.querySelector('.busy-cover');
  if(state.busy&&!cover){cover=document.createElement('div');cover.className='busy-cover';cover.textContent=tr().calculating;root.querySelector('.waveframe')?.append(cover);}
  if(!state.busy)cover?.remove();
  const primary=root.querySelector('[data-action="primary"]');if(primary)primary.disabled=state.busy;
  if(!state.busy){const metrics=root.querySelector('.metrics');if(metrics)metrics.outerHTML=metricsMarkup(tr());}
}

function headerMarkup(t) {
  return `<a class="skip" href="#main">${t.skip}</a>
  <aside class="rail" aria-label="${t.title}">
    <div class="brand" aria-hidden="true">${icon('pulse')}</div>
    <nav class="rail-nav" aria-label="${state.lang === 'zh' ? '实验模式' : 'Lab mode'}">
      <button class="rail-link ${!isChallenge()?'active':''}" data-mode="learn" aria-pressed="${!isChallenge()}">${icon('book')}<span>${t.learn}</span></button>
      <button class="rail-link ${isChallenge()?'active':''}" data-mode="challenge" aria-pressed="${isChallenge()}">${icon('target')}<span>${t.challenge}</span></button>
    </nav>
    <div class="rail-bottom"><div class="language" role="group" aria-label="${t.language}"><button data-lang="zh" lang="zh" class="${state.lang==='zh'?'active':''}" aria-pressed="${state.lang==='zh'}">中</button><button data-lang="en" lang="en" class="${state.lang==='en'?'active':''}" aria-pressed="${state.lang==='en'}">EN</button></div><button class="rail-help" data-dialog="model" aria-label="${t.model}" title="${t.model}">${icon('help')}</button></div>
  </aside>
  <header class="page-header"><div><h1>${t.title}</h1><p>${t.subtitle}</p></div><div class="header-actions"><span class="model-badge"><i class="status-dot"></i>${t.simulation}</span><button class="icon-button" data-action="reset" title="${t.reset}" aria-label="${t.reset}">${icon('reset')}</button></div></header>`;
}

function benchMarkup(t) {
  const status = state.error ? t.error : state.busy ? t.calculating : state.before ? t.repaired : state.captured ? t.captured : t.ready;
  return `<section class="bench" aria-label="${t.bench}">
    <div class="scene"><div class="scene-heading"><h2>${t.bench}</h2><span class="board-note">12 V → 5 V / 100 kHz</span></div><div class="scene-illustration">${boardMarkup(t)}</div><div class="scene-bottom"><p class="scene-hint">${t.benchNote}</p><span class="scene-status ${state.busy?'busy':''}" role="status"><i class="status-dot"></i>${status}</span></div></div>
    ${mobileMedia.matches?mobileOperatorMarkup(t):''}
    <div class="probe-strip" role="group" aria-label="${state.lang==='zh'?'选择测量信号':'Select a measurement'}">${PROBES.map(p=>`<button class="probe-chip ${state.probe===p?'active':''} ${state.observations[p]?'measured':''}" data-probe="${p}" aria-label="${t.probes[p]}" aria-pressed="${state.probe===p}"><span class="probe-letter">${probeLetter(p)}</span>${mobileMedia.matches&&state.lang==='en'?symbols[p]:t.probes[p]}</button>`).join('')}</div>
    <section class="scope" aria-label="${t.scope}"><div class="scope-header"><div class="scope-heading"><span class="scope-icon">${icon('pulse')}</span><h2>${t.scope}</h2></div><div class="scope-tabs" role="group" aria-label="${state.lang==='zh'?'时间视图':'Time scale'}">${['full','transient','ripple'].map(v=>`<button data-view="${v}" class="${state.view===v?'active':''}" aria-pressed="${state.view===v}">${t[v==='ripple'?'rippleView':v]}</button>`).join('')}</div></div>
      <div class="waveframe"><canvas id="waveform" role="img" aria-label="${t.chartLabel}"></canvas>${state.busy?`<div class="busy-cover">${t.calculating}</div>`:''}</div>
      <div class="channel-legend"><span><i class="channel-line"></i>${t.probes.vout}</span>${state.probe!=='vout'?`<span><i class="channel-line second"></i>${t.probes[state.probe]}</span>`:''}${state.before&&state.compare?`<span><i class="channel-line before"></i>${t.compareLegend}</span>`:''}${state.view!=='ripple'?`<span><i class="reference-line"></i>${t.reference}</span>`:''}</div>
      <div class="cursor-row"><span class="scope-time" id="cursor-time"></span><input type="range" id="time-cursor" min="0" max="1000" step="1" value="${Math.round((state.cursor-VIEWS[state.view][0])/(VIEWS[state.view][1]-VIEWS[state.view][0])*1000)}" aria-label="${t.cursor}"><button class="replay-button" data-action="replay" ${state.busy?'disabled':''}>${icon('play')}<span>${state.replaying?t.replaying:t.replay}</span></button></div>
      <div class="cursor-values" id="cursor-values" aria-label="${t.live}"></div>
      ${metricsMarkup(t)}
    </section><div class="scope-under">${state.before?`<label class="compare-label"><input type="checkbox" id="compare" ${state.compare?'checked':''}>${t.compare}</label>`:`<span>${state.view==='ripple'?t.preEvent:t.expectedPulse}</span>`}<button class="export-trigger" data-dialog="export" ${!state.verified?'disabled':''} title="${!state.verified?t.exportLocked:t.record}">${t.record}</button></div>
  </section>`;
}

function metricsMarkup(t) {
  const m = state.result?.metrics, active = state.captured && m;
  const values = active ? [fmt(m.minimum,2), fmt(m.droop*1000,0), fmt(m.ripple*1000,1), m.recovery===null?t.notRecovered:fmt(m.recovery*1000,2)] : ['—','—','—','—'];
  return `<div class="metrics" aria-live="polite">${['minimum','droop','ripple','recovery'].map((k,i)=>`<div><div class="metric-label">${t[k]}</div><div class="metric-value ${i===0&&active&&m.minimum<4.75?'warn':''}">${values[i]}<small>${active&&!(i===3&&m.recovery===null)?['V','mV','mV','ms'][i]:''}</small></div></div>`).join('')}</div>`;
}

function parameter(key, label, value, min, max, step, unit, scale=1) {
  return `<div class="parameter"><label class="parameter-label" for="param-${key}"><span>${label}</span><output class="knob-value" id="value-${key}">${fmt(value*scale,key==='sagVoltage'||key==='pulseLoad'?1:0)} ${unit}</output></label><input id="param-${key}" data-param="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value*scale}" aria-describedby="value-${key}"><div class="param-endpoints" aria-hidden="true"><span>${min} ${unit}</span><span>${max} ${unit}</span></div></div>`;
}

function paramsMarkup(t) {
  const c = state.config;
  return `<section class="panel-section"><h3>${t.experiment}</h3><div class="presets" role="group" aria-label="${t.experiment}">${['healthy','input','load','capacitor'].map(k=>`<button data-preset="${k}" class="preset-button ${state.preset===k?'active':''}" aria-pressed="${state.preset===k}">${t[k]}<i class="preset-dot"></i></button>`).join('')}</div>
  ${state.preset==='input'?parameter('sagVoltage',t.sag,c.sagVoltage,8,12,.1,'V'):''}
  ${state.preset==='load'?parameter('pulseLoad',t.peakLoad,c.pulseLoad,1.5,3,.1,'A'):''}
  ${state.preset==='capacitor'?parameter('capacitance',t.capacitance,c.capacitance,100,680,10,'μF',1e6)+parameter('esr',t.esr,c.esr,20,250,10,'mΩ',1000):''}
  ${state.preset==='healthy'?`<p class="baseline-note">${t.healthyParams}</p>`:`<p class="parameter-explanation">${t.parameterNotes[state.preset]}</p>`}</section>`;
}

function observationText(p, o, t) {
  if (!o) return t.hints[p];
  if (p==='vin') return state.lang==='zh'?`测试期间输入最低 ${fmt(o.minimum)} V，基准为 12 V。`:`Input falls to ${fmt(o.minimum)} V during the test; the baseline is 12 V.`;
  if (p==='iout') return state.lang==='zh'?`实测负载峰值 ${fmt(o.peak)} A，标准测试应为 1.50 A。`:`Measured peak load is ${fmt(o.peak)} A; the planned pulse is 1.50 A.`;
  if (p==='vout') return state.lang==='zh'?`输出最低 ${fmt(o.minimum)} V；测试前纹波 ${fmt(o.ripple*1000,1)} mV。`:`Minimum output is ${fmt(o.minimum)} V; pre-test ripple is ${fmt(o.ripple*1000,1)} mV.`;
  if (p==='il') return state.lang==='zh'?`脉冲期间电感电流为 ${fmt(o.min)}–${fmt(o.max)} A。`:`Inductor current spans ${fmt(o.min)}–${fmt(o.max)} A during the pulse.`;
  return state.lang==='zh'?`脉冲期间占空比范围 ${fmt(o.min*100,1)}%–${fmt(o.max*100,1)}%。`:`Duty cycle spans ${fmt(o.min*100,1)}%–${fmt(o.max*100,1)}% during the pulse.`;
}

function componentMarkup(t) {
  const p=state.probe, concept=t.concepts[p];
  const observation=state.before&&state.result?observationFor(state.result,p):state.observations[p];
  return `<section class="panel-section"><div class="component-heading"><span class="probe-letter">${probeLetter(p)}</span><h3 class="component-title">${concept[0]}</h3></div><p class="component-text">${concept[1]}</p><p class="observation">${state.before?t.retest+' · ':''}${state.captured?observationText(p,observation,t):t.hints[p]}</p></section>`;
}

function logMarkup(t) {
  const keys=PROBES.filter(p=>state.observations[p]);
  const compact = p => {
    const o=state.observations[p];
    if(p==='vin')return fmt(o.minimum)+' V'; if(p==='iout')return fmt(o.peak)+' A';
    if(p==='vout')return fmt(o.minimum)+' V'; if(p==='il')return fmt(o.max)+' A'; return fmt(o.max*100,1)+'%';
  };
  return `<details class="panel-section evidence-details" ${isChallenge()?'open':''}><summary class="log-summary">${state.before?t.beforeLog:t.evidence}<span>${keys.length} ${t.evidenceCount}</span></summary>${keys.length?`<ul class="evidence-list">${keys.map(p=>`<li><span>${t.probes[p]}</span><output>${compact(p)}</output></li>`).join('')}</ul>`:`<p class="small-note">${t.noEvidence}</p>`}</details>`;
}

function feedbackMarkup(t) {
  if(!state.feedback)return '';
  const kind=state.feedback;
  const isSuccess=['verified','tutorialFixed','supported'].includes(kind);
  const comparison=state.before&&state.result?`<p class="mono">${t.minimum}: ${fmt(state.before.metrics.minimum)} → ${fmt(state.result.metrics.minimum)} V</p>`:'';
  return `<div class="feedback ${isSuccess?'':'neutral'}" role="status"><h3>${t[kind]}</h3><p>${t[kind+'Text']}</p>${comparison}${state.verified?`<p class="takeaway">${t.takeaway[currentKind()]||''}</p>`:''}</div>`;
}

function repairMarkup(t) {
  return `<section class="panel-section"><h3>${t.repairTitle}</h3><p class="small-note">${t.repairNote}</p><div class="repair-actions">${['input','load','capacitor'].map(k=>`<button class="repair-button ${state.repair===k?'active':''}" data-repair="${k}" ${state.busy?'disabled':''}>${repairLabel(k)}${icon('tool')}</button>`).join('')}</div></section>`;
}

function inspectorMarkup(t) {
  if(isChallenge()) {
    const finished=state.completed.size===3;
    return `<aside class="inspector" id="inspector" tabindex="-1" aria-label="${t.challenge}"><div class="step-indicator">${t.case} ${String(state.caseIndex+1).padStart(2,'0')} / 03</div><h2 class="task-title">${finished?t.allDone:mobileMedia.matches?t.selectReason:t.caseTitle}</h2>${mobileMedia.matches&&!finished?'':`<p class="task-desc">${finished?t.allDoneText:t.caseDesc}</p>`}<p class="challenge-progress">${t.caseProgress} ${state.completed.size} / 3</p>
      ${!state.confirmed?`<section class="panel-section"><h3>${t.selectReason}</h3><div class="reason-options" role="group" aria-label="${t.selectReason}">${['input','load','capacitor'].map(k=>`<button class="reason-button ${state.choice===k?'active':''}" data-reason="${k}" aria-pressed="${state.choice===k}"><i class="radio-circle"></i>${t[k]}</button>`).join('')}</div><button class="primary-button" data-action="submit" ${state.busy?'disabled':''}>${t.submit}${icon('arrow')}</button></section>`:repairMarkup(t)}
      ${feedbackMarkup(t)}${state.verified?`<button class="primary-button" data-action="next-case">${state.caseIndex<2?t.nextCase:t.learn}${icon('arrow')}</button>`:''}
      ${componentMarkup(t)}${logMarkup(t)}</aside>`;
  }
  if(mobileMedia.matches)return `<aside class="inspector mobile-explanation" id="inspector" aria-label="${t.learn}">${componentMarkup(t)}${state.captured?logMarkup(t):''}</aside>`;
  const step=t.steps[state.step];
  return `<aside class="inspector" aria-label="${t.learn}"><div class="step-indicator"><div class="step-dots" aria-hidden="true">${t.steps.map((_,i)=>`<i class="${i<=state.step?'active':''}"></i>`).join('')}</div>${String(state.step+1).padStart(2,'0')} / 04</div><h2 class="task-title">${step[1]}</h2><p class="task-desc">${step[2]}</p>
    <button class="primary-button" data-action="primary" ${state.busy?'disabled':''}>${state.step===0?t.run:state.step===1?t.nextMeasure:state.step===2?t.nextVerify:state.verified?t.enterChallenge:t.rerun}${icon(state.step===0?'play':'arrow')}</button>
    ${state.step===3?repairMarkup(t):paramsMarkup(t)}${feedbackMarkup(t)}${componentMarkup(t)}${state.captured?logMarkup(t):''}</aside>`;
}

function mobileOperatorMarkup(t) {
  if(isChallenge())return `<section class="mobile-operator"><div class="mobile-task-line"><span class="mobile-step">${t.case} ${state.caseIndex+1}/3</span><h2>${t.caseTitle}</h2></div><p class="mobile-task-desc">${t.caseDesc}</p><button class="mobile-jump" data-action="show-diagnosis">${t.goDiagnosis}${icon('arrow')}</button></section>`;
  const step=t.steps[state.step];
  const action=state.step===0?t.run:state.step===1?t.nextMeasure:state.step===2?t.nextVerify:state.verified?t.enterChallenge:t.rerun;
  return `<section class="mobile-operator"><div class="mobile-task-line"><span class="mobile-step">${state.step+1}/4</span><h2>${step[1]}</h2></div><p class="mobile-task-desc">${step[2]}</p><button class="primary-button" data-action="primary" ${state.busy?'disabled':''}>${action}${icon(state.step===0?'play':'arrow')}</button>${state.step===1||state.step===2?paramsMarkup(t):state.step===3?repairMarkup(t):''}${feedbackMarkup(t)}</section>`;
}

function journeyMarkup(t) {
  return `<nav class="journey ${isChallenge()?'challenge-journey':''}" aria-label="${isChallenge()?t.challenge:t.learn}">${isChallenge()?CASES.map((_,i)=>`<button class="journey-step ${state.caseIndex===i?'active':''}" data-case="${i}" ${state.caseIndex===i?'aria-current="step"':''}><span class="step-thumb">${stepThumb(2)}</span><span><span class="step-num">${String(i+1).padStart(2,'0')}</span><span class="step-name">${t.case} ${i+1}</span></span>${state.completed.has(i)?'<span class="step-check">✓</span>':''}</button>`).join(''):t.steps.map((step,i)=>`<button class="journey-step ${state.step===i?'active':''}" data-step="${i}" ${state.step===i?'aria-current="step"':''}><span class="step-thumb">${stepThumb(i)}</span><span><span class="step-num">${String(i+1).padStart(2,'0')}</span><span class="step-name">${step[0]}</span></span></button>`).join('')}</nav>`;
}

function dialogMarkup(t) {
  return `<dialog id="model-dialog"><div class="dialog-content"><div class="dialog-heading"><h2>${t.modelTitle}</h2><button class="dialog-close" data-close aria-label="${t.close}">${icon('close')}</button></div><p>${t.modelIntro}</p><p>${t.modelDetails}</p><div class="formula">L · diL/dt = s · Vin − Vout − rL · iL<br>C · dvC/dt = iL − Iload<br>Vout = vC + ESR · (iL − Iload)</div><p>${t.modelLimits}</p><p>${t.metricDetails}</p><h3>${t.sources}</h3><ul><li><a href="https://www.analog.com/en/resources/app-notes/buck-power-stage-design-equations.html" target="_blank" rel="noopener noreferrer">Analog Devices · Buck power stage design equations</a></li><li><a href="https://www.richtek.com/Design%20Support/Technical%20Document/AN038" target="_blank" rel="noopener noreferrer">Richtek · DC/DC converter testing with fast load transient</a></li><li><a href="https://www.ti.com/document-viewer/lit/html/SSZTAL7/GUID-3EDE487C-5BCB-45E3-8940-52FAA90331EA" target="_blank" rel="noopener noreferrer">Texas Instruments · Input and output capacitor considerations</a></li></ul><p class="mono">${MODEL_VERSION}</p></div></dialog>
  <dialog id="export-dialog"><div class="dialog-content"><div class="dialog-heading"><h2>${t.record}</h2><button class="dialog-close" data-close aria-label="${t.close}">${icon('close')}</button></div><p>${state.lang==='zh'?'记录包含修复前后的模型参数、数值指标和测量证据。CSV 包含当前捕获的全部波形，单位写在列名中。':'The record includes before/after model parameters, metrics and measurement evidence. CSV contains all samples of the current capture, with units in the headers.'}</p><div class="dialog-buttons"><button data-export="json">${t.exportJSON}</button><button data-export="csv">${t.exportCSV}</button></div></div></dialog>`;
}

function render() {
  const active=document.activeElement, openDialog=root.querySelector('dialog[open]')?.id;
  const focusAttr=['param','lang','mode','probe','part','view','preset','step','case','reason','repair','action'].find(k=>active?.dataset[k]!==undefined);
  if(focusAttr)lastFocusKey=[focusAttr,active.dataset[focusAttr]];
  const t=tr(); document.documentElement.lang=state.lang==='zh'?'zh-CN':'en'; document.title=t.title;
  root.innerHTML=headerMarkup(t).replace('<header class="page-header">','<div class="workspace"><header class="page-header">')+
    `<main id="main"><div class="work-grid">${benchMarkup(t)}${inspectorMarkup(t)}</div>${journeyMarkup(t)}</main><footer class="page-footer"><span>${t.simulation} · ${t.local}</span><button data-dialog="model">${t.model}</button><span class="model-version">v1.0</span></footer></div>${dialogMarkup(t)}<div id="toast" class="toast" role="status" hidden></div>`;
  root.querySelectorAll('[data-part]').forEach(el=>{ const selected=el.dataset.part===state.probe;el.classList.toggle('active',selected);el.setAttribute('aria-pressed',String(selected)); });
  root.querySelector(`[data-callout="${state.probe}"]`)?.classList.add('active');
  observer?.disconnect(); observer=new ResizeObserver(draw); observer.observe(root.querySelector('.waveframe'));
  if(openDialog)root.querySelector('#'+openDialog)?.showModal();
  else if(lastFocusKey)root.querySelector(`[data-${lastFocusKey[0]}="${lastFocusKey[1]}"]`)?.focus({preventScroll:true});
  draw();
}

function draw() {
  const canvas=document.querySelector('#waveform'); if(!canvas||!state.result)return;
  drawWave(canvas,state.result,{probe:state.probe,view:state.view,cursor:state.cursor,before:state.before&&state.compare?state.before:null,t:tr()});
  const point=sampleAt(state.result.trace,state.cursor);
  const time=document.querySelector('#cursor-time');if(time)time.textContent=fmt(state.cursor*1000,state.view==='ripple'?3:2)+' ms';
  const values=document.querySelector('#cursor-values');if(values)values.innerHTML=`<span>${symbols.vout} <b>${fmt(point.vout,3)} V</b></span>${state.probe!=='vout'?`<span>${symbols[state.probe]} <b>${fmt(point[state.probe],state.probe==='sw'?1:3)} ${units[state.probe]}</b></span>`:''}`;
  const path=document.querySelector('.energy-path');if(path)path.style.opacity=point.sw>0?'.7':'.22';
}

function cancelReplay(){if(raf)cancelAnimationFrame(raf);raf=null;state.replaying=false;const label=root.querySelector('.replay-button span');if(label)label.textContent=tr().replay;}
function resetCase(index=state.caseIndex) {
  state.caseIndex=index;state.config=createConfig(CASES[index]);state.captured=true;state.before=null;state.repair=null;
  state.probe='vout';state.view='full';state.cursor=.003;state.choice=null;state.confirmed=false;state.verified=false;
  calculate();
}
function switchMode(mode) {
  if(mode===state.mode)return;
  state.mode=mode;
  if(mode==='challenge')resetCase(0);
  else {state.step=0;state.preset='load';state.config=createConfig('load');state.before=null;state.repair=null;state.captured=false;state.probe='vout';calculate();}
}
function selectProbe(probe) {
  if(state.busy||!PROBES.includes(probe))return;
  state.probe=probe;
  if(state.captured&&originalResult())state.observations[probe]=observationFor(originalResult(),probe);
  render();
}
function doRepair(action) {
  if(state.busy||!state.captured||!state.result||(isChallenge()&&!state.confirmed))return;
  if(!state.before)state.before=state.result;
  state.repair=action;state.compare=true;
  calculate(applyIntervention(state.config,action),false);
}
function submitDiagnosis() {
  if(state.busy)return;
  if(!state.choice){toast(tr().chooseReason);return;}
  const d=diagnose(state.observations);
  if(!d.sufficient)state.feedback='needMore';
  else if(d.supported!==state.choice||state.choice!==currentKind())state.feedback='unsupported';
  else {state.feedback='supported';state.confirmed=true;}
  render();
}
function toast(text) {
  const el=document.querySelector('#toast');if(!el)return;el.textContent=text;el.hidden=false;
  setTimeout(()=>{if(el.isConnected)el.hidden=true;},2600);
}

root.addEventListener('click',event=>{
  const el=event.target.closest('button,[data-part]');if(!el||el.disabled)return;
  if(el.dataset.mode)switchMode(el.dataset.mode);
  else if(el.dataset.lang){state.lang=el.dataset.lang;try{localStorage.setItem('power-bench-language',state.lang);}catch{}render();}
  else if(el.dataset.probe||el.dataset.part)selectProbe(el.dataset.probe||el.dataset.part);
  else if(el.dataset.view){cancelReplay();state.view=el.dataset.view;const [a,b]=VIEWS[state.view];if(state.cursor<a||state.cursor>b)state.cursor=(a+b)/2;render();}
  else if(el.dataset.preset){state.preset=el.dataset.preset;state.config=createConfig(state.preset);state.before=null;state.repair=null;state.captured=true;state.step=Math.max(1,state.step);calculate();}
  else if(el.dataset.step!==undefined){state.step=Number(el.dataset.step);if(state.step>0&&!state.captured){state.captured=true;calculate();}else render();}
  else if(el.dataset.case!==undefined)resetCase(Number(el.dataset.case));
  else if(el.dataset.reason){state.choice=el.dataset.reason;state.feedback=null;render();}
  else if(el.dataset.repair)doRepair(el.dataset.repair);
  else if(el.dataset.dialog){dialogFocus=el;document.querySelector('#'+el.dataset.dialog+'-dialog').showModal();}
  else if(el.hasAttribute('data-close'))el.closest('dialog').close();
  else if(el.dataset.export)exportData(el.dataset.export);
  else if(el.dataset.action==='reset'){
    if(isChallenge())resetCase();else {state.step=0;state.preset='load';state.config=createConfig('load');state.captured=false;state.before=null;state.repair=null;state.probe='vout';state.view='full';calculate();}
  }
  else if(el.dataset.action==='primary'){
    if(state.step===0){state.step=1;state.captured=true;calculate();}
    else if(state.step<3){state.step++;render();}
    else if(state.verified)switchMode('challenge');else {state.before=null;state.repair=null;calculate();}
  }
  else if(el.dataset.action==='submit')submitDiagnosis();
  else if(el.dataset.action==='show-diagnosis'){
    const panel=root.querySelector('#inspector');panel?.focus({preventScroll:true});panel?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  }
  else if(el.dataset.action==='next-case'){if(state.caseIndex<2)resetCase(state.caseIndex+1);else switchMode('learn');}
  else if(el.dataset.action==='replay')replay();
});

root.addEventListener('keydown',event=>{
  if(event.target.matches('[data-part]')&&(event.key==='Enter'||event.key===' ')){event.preventDefault();selectProbe(event.target.dataset.part);root.querySelector(`[data-part="${state.probe}"]`)?.focus();}
});
root.addEventListener('input',event=>{
  const el=event.target;
  if(el.id==='time-cursor'){
    cancelReplay();const [a,b]=VIEWS[state.view];state.cursor=a+(b-a)*Number(el.value)/1000;draw();
    const text=root.querySelector('.replay-button span');if(text)text.textContent=tr().replay;
  } else if(el.dataset.param){
    const key=el.dataset.param,scale=key==='capacitance'?1e6:key==='esr'?1000:1;
    state.config={...state.config,[key]:Number(el.value)/scale};state.captured=true;state.before=null;state.repair=null;state.step=Math.max(state.step,1);
    const output=root.querySelector('#value-'+key);if(output)output.textContent=fmt(Number(el.value),key==='sagVoltage'||key==='pulseLoad'?1:0)+' '+(key==='capacitance'?'μF':key==='esr'?'mΩ':key==='sagVoltage'?'V':'A');
    calculate(state.config,true,true);
  }
});
root.addEventListener('change',event=>{if(event.target.id==='compare'){state.compare=event.target.checked;draw();}});
root.addEventListener('pointerdown',event=>{if(event.target.matches('[data-param]'))state.adjusting=true;});
for(const eventName of ['pointerup','pointercancel'])document.addEventListener(eventName,()=>{if(state.adjusting){state.adjusting=false;render();}});
root.addEventListener('pointermove',event=>{
  if(event.target.id!=='waveform'||event.pointerType==='touch'||!state.result)return;
  const rect=event.target.getBoundingClientRect(),px=event.clientX-rect.left;
  if(px<43||px>rect.width-12)return;
  cancelReplay();const [a,b]=VIEWS[state.view];state.cursor=a+(b-a)*(px-43)/(rect.width-55);
  const slider=document.querySelector('#time-cursor');if(slider)slider.value=(state.cursor-a)/(b-a)*1000;draw();
});
root.addEventListener('click',event=>{
  if(event.target.tagName==='DIALOG'){
    const rect=event.target.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.target.close();
  }
});
root.addEventListener('close',()=>{dialogFocus?.focus();},true);
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelReplay();});
mobileMedia.addEventListener('change',()=>render());

function replay() {
  if(!state.result||state.busy)return;
  cancelReplay();const [a,b]=VIEWS[state.view];
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){state.cursor=b;const slider=root.querySelector('#time-cursor');if(slider)slider.value=1000;draw();return;}
  const start=performance.now();state.replaying=true;
  const label=root.querySelector('.replay-button span');if(label)label.textContent=tr().replaying;
  const tick=now=>{
    const progress=Math.min(1,(now-start)/1600);state.cursor=a+(b-a)*progress;
    const slider=document.querySelector('#time-cursor');if(slider)slider.value=progress*1000;draw();
    if(progress<1)raf=requestAnimationFrame(tick);else{cancelReplay();if(label?.isConnected)label.textContent=tr().replay;}
  };
  raf=requestAnimationFrame(tick);
}

function exportData(type) {
  if(!state.verified||!state.result)return;
  const data=type==='csv'?waveformCSV(state.result):JSON.stringify({
    schemaVersion:1,modelVersion:MODEL_VERSION,mode:state.mode,case:currentKind(),intervention:state.repair,
    before:{config:state.before.config,metrics:state.before.metrics},after:{config:state.result.config,metrics:state.result.metrics},
    observations:state.observations,verified:true,
  },null,2);
  const blob=new Blob([type==='csv'?'\uFEFF'+data:data],{type:type==='csv'?'text/csv;charset=utf-8':'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`buck-${currentKind()}-${MODEL_VERSION}.${type}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(tr().exported);
}

render();calculate();
