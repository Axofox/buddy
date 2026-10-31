// Where Buddy hops to: it lives near the left and right edges of the screen,
// so it stays out of the middle where text boxes and chat inputs usually are.

const EDGE = 0.18; // each edge zone is this share of the screen width

function inMiddle(x, left, right, edge = EDGE) {
  const f = (x - left) / Math.max(right - left, 1);
  return f > edge && f < 1 - edge;
}

const CROSS = 0.3; // chance that a hop from an edge zone goes all the way to the other side

// Picks the next spot (x of Buddy's centre) between left and right.
// In an edge zone: usually somewhere else in the same zone, sometimes a big jump
// over to the other side. In the middle: the nearer edge zone, right away.
function pickTarget(x, left, right, { edge = EDGE, rand = Math.random, cross = CROSS } = {}) {
  const w = Math.max(right - left, 1);
  const zone = w * edge;
  const f = (x - left) / w;
  let goLeft = f < 0.5;
  if (inMiddle(x, left, right, edge) === false && rand() < cross) goLeft = !goLeft;
  const lo = goLeft ? left : right - zone;
  return lo + rand() * zone;
}

module.exports = { EDGE, CROSS, inMiddle, pickTarget };
