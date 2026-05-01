export function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function stddev(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = mean(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

export function pctChange(previous, current) {
  if (!previous) return 0;
  return (current - previous) / previous;
}

export function returns(candles) {
  const series = [];
  for (let index = 1; index < candles.length; index += 1) {
    series.push(pctChange(candles[index - 1].close, candles[index].close));
  }
  return series;
}

export function maxDrawdown(candles) {
  let peak = candles[0]?.close ?? 0;
  let maxDd = 0;
  for (const candle of candles) {
    peak = Math.max(peak, candle.close);
    const dd = peak === 0 ? 0 : (candle.close - peak) / peak;
    maxDd = Math.min(maxDd, dd);
  }
  return maxDd;
}

export function correlation(a, b) {
  const count = Math.min(a.length, b.length);
  if (count < 2) return 0;
  const left = a.slice(-count);
  const right = b.slice(-count);
  const leftMean = mean(left);
  const rightMean = mean(right);
  const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0);
  const leftDen = Math.sqrt(left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0));
  const rightDen = Math.sqrt(right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0));
  if (leftDen === 0 || rightDen === 0) return 0;
  return numerator / (leftDen * rightDen);
}

export function last(candles) {
  return candles[candles.length - 1];
}
