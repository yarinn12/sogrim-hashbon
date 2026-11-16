// Runs unchanged in a real Android WebView and in browser regression tests.
// Container-fit checks alone miss a word or a monetary value split internally.
export function measureEventInlineReadability() {
  const measure = (node, boundary) => {
    if (!node || !boundary) return { present: false, singleLine: false, fits: false, words: [] };
    const box = boundary.getBoundingClientRect();
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const words = [], tops = [], rectangles = [];
    while (walker.nextNode()) {
      const text = walker.currentNode;
      for (const match of text.textContent.matchAll(/\S+/gu)) {
        const range = document.createRange();
        range.setStart(text, match.index);
        range.setEnd(text, match.index + match[0].length);
        const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
        const lines = [...new Set(rects.map(rect => Math.round(rect.top * 2) / 2))];
        words.push({ text: match[0], lines: lines.length });
        tops.push(...lines);
        rectangles.push(...rects);
      }
    }
    return {
      present: box.width > 0 && box.height > 0 && words.length > 0,
      text: node.textContent.trim(),
      fontSize: Number.parseFloat(getComputedStyle(node).fontSize),
      words,
      singleLine: new Set(tops).size === 1,
      fits: rectangles.length > 0 && rectangles.every(rect => rect.left >= box.left - 1
        && rect.right <= box.right + 1 && rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1),
      box: box.toJSON(),
      rectangles: rectangles.map(rect => rect.toJSON())
    };
  };
  const labels = [...document.querySelectorAll('.event-overview-header .event-header-action-label')]
    .map(node => measure(node, node.closest('button')));
  const value = document.querySelector('.event-personal-balance-value');
  const amount = measure(value?.querySelector('.font-num'), value);
  return {
    labels, amount,
    wholeActionWords: labels.length === 3 && labels.every(label => label.present && label.fits
      && label.words.every(word => word.lines === 1)),
    wholeAmount: amount.present && amount.singleLine && amount.fits,
    noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1
  };
}
