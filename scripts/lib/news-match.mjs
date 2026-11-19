// What "the same story" means, for every script that compares news.
//
// Lifted out of verify-news-duplicates.mjs on 2026-11-19, when the weekly
// candidates script became the second thing to ask the question. Two copies of
// a URL normaliser would disagree the first time one of them was improved, and
// then one script would call a story new while the other called it published.
// Node only, like everything in scripts/lib/.

export function normUrl(u) {
  if (!u) return '';
  try {
    const p = new URL(String(u));
    return (p.hostname.replace(/^www\./, '') + p.pathname.replace(/\/+$/, '')).toLowerCase();
  } catch {
    return String(u).trim().toLowerCase().replace(/\/+$/, '');
  }
}

// Title comparison is deliberately crude and deliberately NOT the primary
// signal. It catches a reworded headline over the same story and gives a report
// something readable to print; the judgement stays with whoever reads it.
export function words(t) {
  return new Set(
    String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 3)
  );
}

export function overlap(a, b) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return hit / Math.min(A.size, B.size);
}
