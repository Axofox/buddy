// What Buddy looks like at each stage of each life (see pet.js).
// Shapes are drawn in a 100×100 box; the face (eyes at 33/67, 64) is shared.
//
//   d(o, up)  outline; o = sideways nudges for the swaying tips, up = lift
//   tips      how many tips sway (0 = the outline stays still)
//   grow      overall size
//   top       highest point, so hats sit on the head
//   color     own colour (the fire uses your colour setting)
//   back/front  extra drawing behind/in front of the body
//   face      moves the face (e.g. frog eyes on top)
// Wrapped so its helper names can't clash with renderer.js (they share a page).
(() => {
const SWAY_FRAMES = [
  [[0, 0, 0, 0], 0],
  [[-3.5, 4, -3, 3.5], 1.5],
  [[2, -1.5, 3.5, -2], 0],
  [[4, -4, 2, -3], 2],
  [[0, 0, 0, 0], 0],
];

const n = (v) => Math.round(v * 100) / 100;
const BODY = 'style="fill: var(--body)"';

const DOT = {
  d: () => 'M50 94 C33 94 24 82 24 68 C24 54 35 44 50 44 C65 44 76 54 76 68 C76 82 67 94 50 94 Z',
  tips: 0, grow: 0.5, top: 44, face: 'translate(50 68) scale(0.72) translate(-50 -64)',
};
const ROUND = 'M50 94 C26 94 18 80 18 64 C18 47 32 38 50 38 C68 38 82 47 82 64 C82 80 74 94 50 94 Z';

const flame = ([a = 0, b = 0, c = 0], up = 0) => `M18 90 C13 76 13 58 18 46 C20 39 ${n(21 + a * 0.5)} 33 ${n(21 + a)} ${n(26 - up)} `
  + `C${n(27 + a * 0.5)} 30 31 34 33 39 C35 25 ${n(43 + b * 0.5)} 13 ${n(52 + b)} ${n(3 - up)} `
  + `C${n(56 + b * 0.5)} 13 60 21 62 30 C66 24 ${n(70 + c * 0.5)} 18 ${n(75 + c)} ${n(13 - up)} `
  + `C${n(77 + c * 0.5)} 22 79 30 80 38 C87 50 89 72 84 90 Q79 98 73 92 Q67 98 62 92 `
  + 'Q56 98 50 92 Q44 98 38 92 Q32 98 27 92 Q21 98 18 90 Z';

const leafy = ([a = 0], up = 0) => `M50 94 C24 92 16 74 19 58 C22 40 38 22 ${n(64 + a)} ${n(6 - up)} `
  + `C${n(68 + a * 0.5)} 26 82 44 81 62 C80 80 72 94 50 94 Z`;

const froggy = 'M50 94 C24 94 14 80 16 64 C17 54 20 48 24 44 C22 30 44 30 42 42 C47 41 53 41 58 42 '
  + 'C56 30 78 30 76 44 C80 48 83 54 84 64 C86 80 76 94 50 94 Z';

const catBody = (ear) => `M50 94 C28 94 20 82 20 66 C20 56 23 50 27 46 L28 ${ear} L38 42 C42 41 58 41 62 42 `
  + `L72 ${ear} L73 46 C77 50 80 56 80 66 C80 82 72 94 50 94 Z`;
const catEars = (ear) => `<path d="M30 ${ear + 6} L31 45 L36 42 Z M70 ${ear + 6} L69 45 L64 42 Z" fill="#ffb3c1"/>`;
const catNose = '<path d="M48 60.5 L52 60.5 L50 63 Z" fill="#ff8fa3"/>';
const catTail = (s) => `<path class="tail" d="M78 87 C${n(95 * s)} 85 ${n(99 * s)} 66 ${n(90 * s)} 51 C${n(85 * s)} 55 ${n(87 * s)} 66 ${n(84 * s)} 73 C82 78 80 80 76 80 Z" ${BODY}/>`;
const horns = (h) => `<path d="M31 ${h + 22} L${24} ${h} L42 ${h + 16} Z M69 ${h + 22} L${76} ${h} L58 ${h + 16} Z" fill="#f1e3c6"/>`;
const flower = '<g transform="translate(64 0)"><circle cy="-8" r="6" fill="#ff9ec4"/><circle cx="7.6" cy="-2.5" r="6" fill="#ff9ec4"/>'
  + '<circle cx="4.7" cy="6.5" r="6" fill="#ff9ec4"/><circle cx="-4.7" cy="6.5" r="6" fill="#ff9ec4"/>'
  + '<circle cx="-7.6" cy="-2.5" r="6" fill="#ff9ec4"/><circle r="4.5" fill="#ffd36b"/></g>';
const feet = `<path d="M24 86 C14 88 14 98 26 96 L34 92 Z M76 86 C86 88 86 98 74 96 L66 92 Z" ${BODY}/>`;
const FROG_FACE = 'translate(0 -20)';

const SHAPES = {
  flame: [
    { ...DOT },
    {
      d: ([a = 0], up = 0) => `M50 94 C28 94 18 80 18 64 C18 48 30 38 44 35 C46 30 ${n(49 + a * 0.5)} 26 ${n(54 + a)} ${n(20 - up)} `
        + `C${n(55 + a * 0.5)} 27 57 32 60 36 C73 40 82 51 82 64 C82 80 72 94 50 94 Z`,
      tips: 1, grow: 0.62, top: 20,
    },
    {
      d: ([a = 0], up = 0) => 'M22 92 C16 78 16 62 22 50 C28 40 38 34 44 26 C46 32 48 36 52 34 '
        + `C56 28 ${n(58 + a * 0.5)} 18 ${n(62 + a)} ${n(8 - up)} C${n(66 + a * 0.5)} 22 78 36 81 52 C84 68 83 82 78 92 `
        + 'Q72 98 64 92 Q57 98 50 92 Q43 98 36 92 Q29 98 22 92 Z',
      tips: 1, grow: 0.8, top: 8,
    },
    { d: flame, tips: 3, grow: 1, top: 3 },
    {
      d: ([a = 0, b = 0, c = 0, e = 0], up = 0) => `M15 90 C9 76 9 58 14 46 C16 38 ${n(13 + a * 0.5)} 30 ${n(9 + a)} ${n(20 - up)} `
        + `C${n(19 + a * 0.5)} 26 26 32 30 38 C31 26 ${n(34 + b * 0.5)} 16 ${n(38 + b)} ${n(5 - up)} `
        + `C${n(43 + b * 0.5)} 15 46 23 48 30 C52 18 ${n(57 + c * 0.5)} 8 ${n(63 + c)} ${n(-3 - up)} `
        + `C${n(66 + c * 0.5)} 11 66 21 64 30 C70 22 ${n(77 + e * 0.5)} 16 ${n(86 + e)} ${n(11 - up)} `
        + `C${n(84 + e * 0.5)} 21 82 29 80 38 C88 50 90 72 85 90 Q80 98 74 92 Q68 98 62 92 Q56 98 50 92 `
        + 'Q44 98 38 92 Q32 98 26 92 Q20 98 15 90 Z',
      tips: 4, grow: 1.1, top: -3,
    },
  ],

  leaf: [
    { ...DOT, color: '#4fae55' },
    {
      d: () => 'M50 94 C30 94 22 82 23 68 C24 54 36 44 50 42 C64 44 76 54 77 68 C78 82 70 94 50 94 Z',
      tips: 0, grow: 0.62, top: 24, color: '#4fae55',
      front: '<path d="M50 43 C47 34 51 26 59 23 C60 32 56 39 50 43 Z" fill="#7fd36b"/>',
    },
    {
      d: ([a = 0, b = 0], up = 0) => `${ROUND} M49 39 C44 30 ${n(34 + a * 0.5)} ${n(23 - up)} ${n(22 + a)} ${n(24 - up)} C27 34 38 39 49 39 Z `
        + `M51 39 C56 30 ${n(66 + b * 0.5)} ${n(23 - up)} ${n(78 + b)} ${n(24 - up)} C73 34 62 39 51 39 Z`,
      tips: 2, grow: 0.8, top: 22, color: '#4fae55',
    },
    {
      d: leafy, tips: 1, grow: 1, top: 6, color: '#4fae55',
      front: '<path d="M57 38 Q60 26 63 16" stroke="rgba(0,0,0,0.15)" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
    },
    {
      d: () => leafy([0]), tips: 0, grow: 1.08, top: -12, color: '#4fae55', anim: 'sway', front: flower,
    },
  ],

  monster: [
    { ...DOT, color: '#8a6cf0' },
    {
      d: () => 'M50 95 C27 95 20 78 21 62 C22 40 34 20 50 20 C66 20 78 40 79 62 C80 78 73 95 50 95 Z',
      tips: 0, grow: 0.7, top: 20, color: '#f1e3c6',
      front: '<path d="M23 50 L31 45 L38 53 L46 45 L54 53 L62 45 L70 52 L78 47" fill="none" stroke="#c9b38a" stroke-width="2.5" stroke-linejoin="round"/>',
    },
    {
      d: () => ROUND, tips: 0, grow: 0.82, top: 26, color: '#8a6cf0',
      back: horns(26),
      front: '<path d="M20 86 L28 80 L36 88 L44 80 L52 88 L60 80 L68 88 L76 80 L82 86 C80 93 72 98 50 98 C28 98 20 93 20 86 Z" fill="#f1e3c6"/>',
    },
    {
      d: () => 'M50 92 C26 92 16 78 16 62 C16 44 30 32 50 32 C70 32 84 44 84 62 C84 78 74 92 50 92 Z '
        + 'M26 90 C24 97 34 99 36 92 Z M64 92 C66 99 76 97 74 90 Z M17 62 C8 60 6 72 15 74 Z M83 62 C92 60 94 72 85 74 Z',
      tips: 0, grow: 1, top: 14, color: '#8a6cf0', back: horns(14),
    },
    {
      d: () => 'M50 92 C24 92 14 78 14 60 C14 46 22 38 30 34 L34 24 L42 30 L50 20 L58 30 L66 24 L70 34 '
        + 'C78 38 86 46 86 60 C86 78 76 92 50 92 Z M24 90 C22 97 34 99 36 92 Z M64 92 C66 99 78 97 76 90 Z '
        + 'M15 60 C5 58 3 72 13 74 Z M85 60 C95 58 97 72 87 74 Z',
      tips: 0, grow: 1.12, top: 16, color: '#8a6cf0',
      back: '<path d="M24 46 C10 42 8 26 14 16 C17 30 24 34 31 38 Z M76 46 C90 42 92 26 86 16 C83 30 76 34 69 38 Z" fill="#f1e3c6"/>',
    },
  ],

  frog: [
    { ...DOT, color: '#79c94b' },
    {
      d: () => ROUND, tips: 0, grow: 0.62, top: 38, color: '#b7e39b',
      front: '<circle cx="30" cy="48" r="5" fill="#fff" opacity="0.55"/><circle cx="74" cy="80" r="3" fill="#fff" opacity="0.4"/>',
    },
    {
      d: () => ROUND, tips: 0, grow: 0.75, top: 38, color: '#6aa84f',
      back: `<path class="tail wiggle" d="M78 64 C90 56 100 68 112 60 C104 78 92 74 80 80 Z" ${BODY}/>`,
    },
    {
      d: () => froggy, tips: 0, grow: 0.88, top: 32, color: '#79c94b', face: FROG_FACE,
      back: `<path class="tail wiggle" d="M80 80 C90 80 94 86 100 82 C96 92 88 90 80 88 Z" ${BODY}/>`,
      front: '<ellipse cx="50" cy="76" rx="20" ry="13" fill="#c8eba0"/>',
    },
    {
      d: () => froggy, tips: 0, grow: 1.05, top: 32, color: '#79c94b', face: FROG_FACE,
      back: feet, front: '<ellipse cx="50" cy="76" rx="22" ry="14" fill="#c8eba0"/>',
    },
  ],

  cat: [
    { ...DOT, color: '#f2a65a' },
    {
      d: () => catBody(34), tips: 0, grow: 0.65, top: 34, color: '#f2a65a', front: catEars(34) + catNose,
    },
    {
      d: () => catBody(26), tips: 0, grow: 0.82, top: 26, color: '#f2a65a',
      back: catTail(0.92), front: catEars(26) + catNose,
    },
    {
      d: () => catBody(22), tips: 0, grow: 1, top: 22, color: '#f2a65a', back: catTail(1), front: catEars(22) + catNose,
    },
    {
      d: () => catBody(18), tips: 0, grow: 1.1, top: 18, color: '#f2a65a', back: catTail(1.05),
      front: catEars(18) + catNose
        + '<path d="M44 40 L46 47 M50 39 L50 46 M56 40 L54 47" stroke="#d9823a" stroke-width="3" stroke-linecap="round"/>'
        + '<path d="M8 63 L22 66 M8 70 L22 69 M92 63 L78 66 M92 70 L78 69" stroke="#7a4a20" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>',
    },
  ],
};

// The outline at rest, and the frames of its swaying animation.
function shapePaths(def) {
  const rest = def.d([], 0);
  if (!def.tips) return { rest, frames: [rest, rest] };
  return { rest, frames: SWAY_FRAMES.map(([o, up]) => def.d(o, up)) };
}

const api = { SHAPES, SWAY_FRAMES, shapePaths };
if (typeof module !== 'undefined') module.exports = api;
else Object.assign(window, api);
})();
