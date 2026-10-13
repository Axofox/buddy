// Where Buddy hops to: it lives near the left and right edges of the screen,
// so it stays out of the middle where text boxes and chat inputs usually are.

const EDGE = 0.18; // each edge zone is this share of the screen width

function inMiddle(x, left, right, edge = EDGE) {
  const f = (x - left) / Math.max(right - left, 1);
  return f > edge && f < 1 - edge;
}

// Picks the next spot (x of Buddy's centre) between left and right.
// In an edge zone: somewhere else in the same zone. In the middle: the nearer edge zone.
function pickTarget(x, left, right, { edge = EDGE, rand = Math.random } = {}) {
  const w = Math.max(right - left, 1);
  const zone = w * edge;
  const f = (x - left) / w;
  const goLeft = f < 0.5;
  const lo = goLeft ? left : right - zone;
  return lo + rand() * zone;
}

module.exports = { EDGE, inMiddle, pickTarget };
