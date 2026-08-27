/** Immutable reorder: move item from `from` index to `to` index. */
export function reorderItems<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return list;
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function moveByDir<T>(list: T[], index: number, dir: -1 | 1): T[] {
  return reorderItems(list, index, index + dir);
}
