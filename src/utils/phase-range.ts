export function sliceNamedRange<T extends { name: string }>(
  items: T[],
  fromName?: string,
  toName?: string,
  label = 'phase',
): T[] {
  const startIndex = fromName ? items.findIndex((item) => item.name === fromName) : 0;
  if (startIndex === -1) throw new Error(`Unknown from ${label}: ${fromName}`);
  const endIndex = toName ? items.findIndex((item) => item.name === toName) : items.length - 1;
  if (endIndex === -1) throw new Error(`Unknown to ${label}: ${toName}`);
  if (endIndex < startIndex) throw new Error(`to ${label} must come after from ${label}`);
  return items.slice(startIndex, endIndex + 1);
}
