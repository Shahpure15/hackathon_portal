export function judgeTotalPct(fields, marks) {
  let totalWeight = 0;
  for (const f of fields) {
    totalWeight += Number(f.weight);
  }
  if (totalWeight <= 0) {
    throw new Error('total weight must be positive');
  }

  let acc = 0;
  for (const f of fields) {
    const mx = Number(f.maxMarks);
    if (mx <= 0) {
      throw new Error('maxMarks must be positive');
    }
    const m = Number(marks[f.id]);
    if (isNaN(m) || m < 0 || m > mx) {
      throw new Error('marks out of range');
    }
    acc += (m / mx) * (Number(f.weight) / totalWeight);
  }
  const pct = acc * 100;
  return Math.round((pct + Number.EPSILON) * 1000) / 1000;
}
