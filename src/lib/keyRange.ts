// Collapse a list of element ids into MIDAS Gen NX's own compact selection
// notation: a run of 3+ consecutive ids becomes "<first>to<last>" (e.g.
// "181to185"), runs of 1 or 2 are listed individually, everything joined by
// spaces — exactly how Gen NX shows a member selection ("174 175 181to185
// 204to206 …"). This keeps the "applies to N elements" list readable when a
// section spans dozens of members instead of dumping a comma list of every id.
//
// Any non-integer key (shouldn't happen for real element ids, but e.g. an
// "elem:"-style fallback) is passed through unchanged, appended after the
// numeric ranges.
export function compressKeyRanges(keys: string[]): string {
  const nums: number[] = [];
  const nonNum: string[] = [];
  for (const k of keys) {
    const v = Number(k);
    if (Number.isInteger(v)) nums.push(v);
    else if (k.trim() !== "") nonNum.push(k);
  }
  const uniq = Array.from(new Set(nums)).sort((a, b) => a - b);

  const parts: string[] = [];
  let i = 0;
  while (i < uniq.length) {
    let j = i;
    while (j + 1 < uniq.length && uniq[j + 1] === uniq[j] + 1) j++;
    const runLen = j - i + 1;
    if (runLen >= 3) {
      parts.push(`${uniq[i]}to${uniq[j]}`);
    } else {
      for (let k = i; k <= j; k++) parts.push(String(uniq[k]));
    }
    i = j + 1;
  }
  return [...parts, ...nonNum].join(" ");
}
