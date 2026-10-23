import { PROBES, esc } from './i18n.js';

export function boardMarkup(t) {
  const pin = (x, y, vertical = false) => `<rect x="${x}" y="${y}" width="${vertical ? 5 : 15}" height="${vertical ? 15 : 5}" rx="1" fill="url(#pin-metal)" stroke="#787b7c" stroke-width=".7"/>`;
  let pins = '';
  for (let i = 0; i < 6; i++) pins += pin(315 + i * 12, 182, true) + pin(315 + i * 12, 227, true);
  let coil = '';
  for (let i = 0; i < 9; i++) coil += `<path d="M${464 + i * 9} 173 C${449 + i * 9} 150 ${449 + i * 9} 123 ${462 + i * 9} 124 C${477 + i * 9} 124 ${478 + i * 9} 157 ${466 + i * 9} 184" fill="none" stroke="#684632" stroke-width="7"/><path d="M${462 + i * 9} 171 C${452 + i * 9} 149 ${453 + i * 9} 128 ${462 + i * 9} 128 C${471 + i * 9} 128 ${475 + i * 9} 153 ${467 + i * 9} 177" fill="none" stroke="url(#copper)" stroke-width="4.5"/>`;
  const spots = {
    vin: [137, 216, 49, 45, 180, 180], sw: [352, 210, 292, 150, 118, 106],
    il: [504, 185, 437, 112, 132, 115], vout: [671, 210, 624, 142, 110, 135],
    iout: [818, 226, 770, 168, 113, 115],
  };
  const targets = PROBES.map(p => {
    const [x, y, bx, by, w, h] = spots[p];
    return `<g class="part-target" data-part="${p}" role="button" tabindex="0" aria-label="${esc(t.probes[p])}" aria-pressed="false"><title>${esc(t.probes[p])}</title><rect class="part-hit" x="${bx}" y="${by}" width="${w}" height="${h}" rx="20"/><circle class="probe-halo" cx="${x}" cy="${y}" r="16"/><circle class="probe-pad" cx="${x}" cy="${y}" r="7"/><circle cx="${x}" cy="${y}" r="2.3" fill="#faf7ef"/></g>`;
  }).join('');
  const labels = [
    ['vin', 'M137 216 L117 123 L74 80', 58, 59, 'start'],
    ['sw', 'M352 210 L323 115 L277 80', 234, 59, 'start'],
    ['il', 'M504 185 L560 92 L582 72', 570, 51, 'start'],
    ['vout', 'M671 210 L728 119 L799 80', 775, 59, 'start'],
    ['iout', 'M818 226 L882 291 L923 310', 923, 339, 'end'],
  ].map(([p, d, x, y, anchor]) => `<g class="part-callout" data-callout="${p}" aria-hidden="true"><path d="${d}"/><text x="${x}" y="${y}" text-anchor="${anchor}">${esc(t.parts[p])}</text><circle cx="${spots[p][0]}" cy="${spots[p][1]}" r="3"/></g>`).join('');
  return `<svg class="board-svg" viewBox="0 32 980 313" role="img" aria-label="${esc(t.circuitAlt)}">
  <defs>
    <linearGradient id="pcb" x1="0" y1="0" x2=".6" y2="1"><stop stop-color="#e2e6d9"/><stop offset="1" stop-color="#cbd4c1"/></linearGradient>
    <linearGradient id="pin-metal"><stop stop-color="#aaa99e"/><stop offset=".5" stop-color="#e3dfd1"/><stop offset="1" stop-color="#858c89"/></linearGradient>
    <linearGradient id="copper"><stop stop-color="#a5653d"/><stop offset=".35" stop-color="#e0aa70"/><stop offset=".65" stop-color="#c5814a"/><stop offset="1" stop-color="#87583b"/></linearGradient>
    <linearGradient id="cap-metal"><stop stop-color="#919c99"/><stop offset=".25" stop-color="#d7ddcf"/><stop offset=".45" stop-color="#edf0e4"/><stop offset=".7" stop-color="#b6c2b6"/><stop offset="1" stop-color="#7f9290"/></linearGradient>
    <linearGradient id="cap-sleeve"><stop stop-color="#354d58"/><stop offset=".3" stop-color="#5c7679"/><stop offset=".58" stop-color="#4b666e"/><stop offset="1" stop-color="#2d4854"/></linearGradient>
    <filter id="board-shadow" x="-25%" y="-40%" width="150%" height="190%"><feDropShadow dx="0" dy="16" stdDeviation="14" flood-color="#66634c" flood-opacity=".16"/></filter>
  </defs>
  <g filter="url(#board-shadow)">
    <path d="M93 127 L791 94 Q806 93 814 105 L903 270 Q907 283 894 286 L196 324 Q183 325 175 313 L88 145 Q82 133 93 127Z" fill="#8f9e8b" stroke="#626d65" stroke-width="1.6"/>
    <path d="M93 117 L791 84 Q806 83 814 95 L903 260 Q907 273 894 276 L196 314 Q183 315 175 303 L88 135 Q82 123 93 117Z" fill="url(#pcb)" stroke="#697970" stroke-width="1.5"/>
    <path d="M110 132 L787 100 L884 258 L197 295Z" fill="none" stroke="#edf0e1" stroke-width="1.4"/>
  </g>
  <g fill="#a0ac94" stroke="#6a786b" stroke-width="1.2">${[[112,137],[787,107],[201,294],[878,255]].map(([x,y])=>`<ellipse cx="${x}" cy="${y}" rx="9" ry="6"/><ellipse cx="${x}" cy="${y}" rx="3.5" ry="2.5" fill="#6d7766"/>`).join('')}</g>
  <g stroke="#a3b79e" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M153 215 L298 208 M386 204 L453 191 M551 187 L675 181 L797 204"/>
    <path d="M200 258 L278 280 L826 253"/>
    <path d="M348 231 L368 271 M679 215 L694 256 M814 226 L826 253"/>
  </g>
  <g stroke="#708b76" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M153 215 L298 208 M386 204 L453 191 M551 187 L675 181 L797 204"/>
    <path d="M200 258 L278 280 L826 253 M348 231 L368 271 M679 215 L694 256 M814 226 L826 253"/>
  </g>
  <path class="energy-path" d="M153 215 L298 208 L386 204 L453 191 L551 187 L675 181 L797 204" fill="none" stroke="#28736f" stroke-width="3" stroke-dasharray="6 11" opacity=".45"/>
  <g stroke="#728c78" stroke-width="1.2" fill="none"><path d="M359 208 L388 250 L449 248 L470 264 M671 211 L644 265 L506 275" stroke-dasharray="4 4"/><path d="M450 255 L507 253 L518 278 L462 281Z"/></g>
  <g font-family="ui-monospace,monospace" font-size="10" fill="#637763" opacity=".85"><text x="254" y="154" transform="rotate(-3 254 154)">SYNCHRONOUS BUCK</text><text x="480" y="298" transform="rotate(-3 480 298)">100 kHz / 5 V</text><text x="453" y="272" transform="rotate(-3 453 272)">CTRL</text><text x="230" y="271">GND</text></g>
  <g fill="#465044" opacity=".12"><ellipse cx="178" cy="246" rx="51" ry="15"/><ellipse cx="356" cy="231" rx="49" ry="9"/><ellipse cx="510" cy="205" rx="61" ry="12"/><ellipse cx="674" cy="237" rx="40" ry="10"/><ellipse cx="824" cy="239" rx="48" ry="10"/></g>
  <g>
    <path d="M127 176 L186 172 L214 228 L154 233Z" fill="#3a5955" stroke="#314b47" stroke-width="1.5"/>
    <path d="M154 233 L214 228 L214 250 L154 256Z" fill="#314a49" stroke="#314b47"/>
    <path d="M127 176 L154 233 L154 256 L127 200Z" fill="#4f7165" stroke="#314b47"/>
    <ellipse cx="153" cy="190" rx="10" ry="7" fill="#d1c9a8" stroke="#6e7669"/><ellipse cx="177" cy="215" rx="10" ry="7" fill="#d1c9a8" stroke="#6e7669"/>
    <path d="M146 190 L160 190 M170 215 L184 215" stroke="#686e5b" stroke-width="2"/>
    <path d="M140 216 L113 217 L91 250" fill="none" stroke="#2d3349" stroke-width="5" stroke-linecap="round"/><path d="M167 245 L127 252 L106 283" fill="none" stroke="#9a624c" stroke-width="5" stroke-linecap="round"/>
  </g>
  <g>${pins}<path d="M306 195 L388 191 L400 224 L317 229Z" fill="#262f3b" stroke="#24303c" stroke-width="1.5"/><path d="M317 229 L400 224 L400 232 L317 237Z" fill="#172630"/><circle cx="321" cy="203" r="3" fill="#76827e"/><path d="M334 204 L372 202 M337 211 L377 209" stroke="#85928b" stroke-width="1"/></g>
  <g><path d="M449 151 L530 143 L561 192 L477 203Z" fill="#6f7168" stroke="#3c4946" stroke-width="1.3"/><path d="M477 203 L561 192 L561 204 L477 215Z" fill="#45514a"/><path d="M449 151 L477 203 L477 215 L449 162Z" fill="#58615a"/>${coil}<path d="M453 183 L450 194 M543 174 L551 186" stroke="#be8c60" stroke-width="5" stroke-linecap="round"/></g>
  <g>
    <path d="M638 173 L638 226 C638 244 707 244 707 226 L707 173Z" fill="url(#cap-sleeve)" stroke="#344957" stroke-width="1.2"/>
    <path d="M638 173 L638 188 C638 206 707 206 707 188 L707 173Z" fill="url(#cap-metal)"/>
    <ellipse cx="672.5" cy="173" rx="34.5" ry="14" fill="#d6dccf" stroke="#82908a" stroke-width="1.2"/>
    <ellipse cx="672.5" cy="173" rx="29" ry="10" fill="#e2e4d8" stroke="#b3bdb0"/>
    <path d="M653 166 L693 180 M691 166 L656 180" stroke="#adb5aa" stroke-width="1.1"/>
    <path d="M646 202 L646 224" stroke="#c9d5c7" stroke-width="4" opacity=".6"/><path d="M645 207 L647 207 M645 215 L647 215 M645 223 L647 223" stroke="#405663" stroke-width="1.2"/>
    <text x="665" y="218" fill="#d9e2d4" font-size="9" font-family="ui-monospace,monospace">Cout</text>
  </g>
  <g><path d="M770 185 L822 181 L858 222 L805 228Z" fill="#e4ddc9" stroke="#8c9383" stroke-width="1.2"/><path d="M805 228 L858 222 L858 239 L805 245Z" fill="#aaae9b" stroke="#8c9383"/><path d="M770 185 L805 228 L805 245 L770 203Z" fill="#c5c9b6"/><path d="M784 191 L808 189 L835 218 L810 220Z" fill="#727e79"/><path d="M789 194 L812 218 M795 193 L818 217 M801 192 L824 217" stroke="#c4c5b3" stroke-width="2"/></g>
  <g fill="#cfc8ac" stroke="#6e7868" stroke-width="1">${[[263,211],[406,203],[597,184],[740,192],[608,261]].map(([x,y])=>`<ellipse cx="${x}" cy="${y}" rx="4" ry="3"/>`).join('')}</g>
  ${labels}${targets}
  </svg>`;
}

export function stepThumb(index) {
  const shapes = [
    '<path d="M12 29h11m0 0c0-13 6-13 6 0s6 13 6 0 6-13 6 0 6 13 6 0h8m0-9v18m6-18v18m-6-9h16"/>',
    '<path d="M9 30h17v-12h20v19h23M39 9l-7 15h9l-7 15"/>',
    '<path d="M11 40l19-19m-3-6 10 10m-2-13 5-5m-8 27h34M51 14v24m-8-16h17"/><circle cx="26" cy="25" r="2"/>',
    '<path d="M8 32h13l7-11 8 21 9-16 7 6h19M8 25h15l6-7 7 16 8-11 7 2h20"/>',
  ];
  return `<svg viewBox="0 0 80 52" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${shapes[index]}</g></svg>`;
}
