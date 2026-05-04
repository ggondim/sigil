export function keyBy(items, key) {
  const out = {};
  for (const item of items) out[item[key]] = item;
  return out;
}

export function chunk(items, size) {
  if (size < 1) return [];
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
