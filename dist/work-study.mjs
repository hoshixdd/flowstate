// Times use seconds and travel distances use metres.
export const chartActivities = Object.freeze({
  material: Object.freeze(['operation', 'transport', 'inspection', 'delay', 'storage', 'operation-inspection']),
  worker: Object.freeze(['operation', 'move', 'delay', 'inspection']),
  form: Object.freeze(['creation', 'operation', 'transport', 'inspection', 'delay', 'storage', 'disposal'])
});

function measured(value, label, positive = false) {
  if (!Number.isFinite(value) || value < 0 || (positive && value === 0)) {
    throw new RangeError('Invalid ' + label);
  }
  return value;
}

export function chartSummary(type, rows) {
  if (!Object.hasOwn(chartActivities, type)) throw new RangeError('Unknown chart type');
  const counts = Object.fromEntries(chartActivities[type].map(activity => [activity, 0]));
  let seconds = 0;
  let metres = 0;
  for (const row of rows) {
    if (!Object.hasOwn(counts, row.activity)) throw new RangeError('Invalid activity for ' + type);
    counts[row.activity]++;
    seconds += measured(row.seconds, 'step time');
    metres += measured(row.metres, 'step distance');
  }
  return { counts, steps: rows.length, seconds, metres };
}

export function compareMethods(type, presentRows, proposedRows) {
  const present = chartSummary(type, presentRows);
  const proposed = chartSummary(type, proposedRows);
  const counts = Object.fromEntries(chartActivities[type].map(activity =>
    [activity, present.counts[activity] - proposed.counts[activity]]));
  return { present, proposed, savings: { counts, steps: present.steps - proposed.steps,
    seconds: present.seconds - proposed.seconds, metres: present.metres - proposed.metres } };
}

export function productivity(output, input) {
  return measured(output, 'output') / measured(input, 'input', true);
}

// Use the same currency and observation period for output value and all costs.
export function totalProductivity(outputValue, inputCosts) {
  return productivity(outputValue, inputCosts.reduce((sum, cost) => sum + measured(cost, 'input cost'), 0));
}

export function timeStudy(observations, ratingPercent, allowancePercent, basis = 'normal-time') {
  if (!observations.length) throw new RangeError('At least one observation required');
  const observed = observations.reduce((sum, t) => sum + measured(t, 'cycle time', true), 0) / observations.length;
  const normal = observed * measured(ratingPercent, 'performance rating', true) / 100;
  const allowance = measured(allowancePercent, 'allowance') / 100;
  if (!['normal-time', 'shift-time'].includes(basis) || (basis === 'shift-time' && allowance >= 1)) {
    throw new RangeError('Invalid allowance basis or percentage');
  }
  const standard = basis === 'normal-time' ? normal * (1 + allowance) : normal / (1 - allowance);
  return { observed, normal, standard, cyclesPerHour: 3600 / standard };
}

export function samplingShares(counts) {
  const entries = Object.entries(counts);
  for (const [, count] of entries) {
    if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('Invalid observation count');
  }
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (!total) throw new RangeError('At least one observation required');
  return Object.fromEntries(entries.map(([category, count]) => [category, count / total]));
}

// Trace aisle turns as waypoints on the scaled plan.
export function routeDistance(points, metresPerDrawingUnit) {
  const scale = measured(metresPerDrawingUnit, 'layout scale', true);
  let length = 0;
  for (const [i, point] of points.entries()) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new RangeError('Invalid route point');
    if (i) length += Math.hypot(point.x - points[i - 1].x, point.y - points[i - 1].y);
  }
  return length * scale;
}
