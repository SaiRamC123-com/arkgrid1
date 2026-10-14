import { distanceM } from "./geo";

const toRad = (d) => (d * Math.PI) / 180;
const bearing = (a, b) => {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

// Approximate: along-track wind component only (ignores crab angle). wind.dir = direction the wind comes FROM.
function legTime(a, b, speed, wind) {
  const d = distanceM(a, b);
  let v = speed;
  if (wind) v = Math.max(2, speed + wind.speed * Math.cos(toRad(bearing(a, b) - ((wind.dir + 180) % 360))));
  return { distM: d, timeS: d / v };
}

function tour(launch, pts, speed, wind) {
  const left = [...pts];
  let order = [];
  let cur = launch;
  while (left.length) {
    let k = 0;
    left.forEach((p, i) => { if (distanceM(cur, p) < distanceM(cur, left[k])) k = i; });
    order.push(left.splice(k, 1)[0]);
    cur = order[order.length - 1];
  }
  const len = (o) => [launch, ...o, launch].reduce((s, p, i, arr) => (i ? s + distanceM(arr[i - 1], p) : 0), 0);
  let improved = order.length > 2;
  while (improved) { // 2-opt
    improved = false;
    for (let i = 0; i < order.length - 1; i++)
      for (let j = i + 1; j < order.length; j++) {
        const cand = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        if (len(cand) + 1e-6 < len(order)) { order = cand; improved = true; }
      }
  }
  const path = [launch, ...order, launch];
  const legs = path.slice(1).map((p, i) => ({ from: path[i], to: p, ...legTime(path[i], p, speed, wind) }));
  return { order, legs, distM: legs.reduce((s, l) => s + l.distM, 0), timeS: legs.reduce((s, l) => s + l.timeS, 0) };
}

// Adds targets by priority while the closed loop still fits inside the usable battery time
export function planDrone({ launch, targets, speed, enduranceMin, reservePct, wind }) {
  const budgetS = enduranceMin * 60 * (1 - reservePct / 100);
  const sorted = [...targets].sort((a, b) => b.priority - a.priority);
  const chosen = [];
  let best = tour(launch, [], speed, wind);
  sorted.forEach((t) => {
    const trial = tour(launch, [...chosen, t], speed, wind);
    if (trial.timeS <= budgetS) { chosen.push(t); best = trial; }
  });
  return { ...best, budgetS, dropped: sorted.filter((t) => !chosen.includes(t)) };
}

export function toGPX(launch, order, name = "ArkGrid drone inspection") {
  const wpt = (p, n) => `<wpt lat="${p.lat}" lon="${p.lng}"><name>${n.replace(/[<&>]/g, "")}</name></wpt>`;
  const rpt = (p) => `<rtept lat="${p.lat}" lon="${p.lng}"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="ArkGrid" xmlns="http://www.topografix.com/GPX/1/1">\n${wpt(launch, "Launch")}\n${order.map((p, i) => wpt(p, `${i + 1}. ${p.label}`)).join("\n")}\n<rte><name>${name}</name>${[launch, ...order, launch].map(rpt).join("")}</rte>\n</gpx>`;
}