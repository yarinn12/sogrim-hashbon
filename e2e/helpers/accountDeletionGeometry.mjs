import {expect} from '@playwright/test';

export function measureAccountDeletionGeometry(e) {
    const modal = e.getBoundingClientRect(), fonts = {}, bad = [];
    for (const s of ["h2", "#account-delete-description", ".account-delete-confirmation span", "button"]) {
      const el = e.querySelector(s);
      fonts[s] = parseFloat(getComputedStyle(el).fontSize);
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n;
      while (n = walker.nextNode()) for (let i = 0; i < n.length; i++) {
        if (!n.textContent[i].trim()) continue;
        const range = document.createRange();
        range.setStart(n, i);
        range.setEnd(n, i + 1);
        for (const r of range.getClientRects()) if (r.left < modal.left - 1 || r.right > modal.right + 1) bad.push({ s, left: r.left, right: r.right });
      }
    }
    const transform=getComputedStyle(e).transform;
    const matrix=transform==='none'?null:new DOMMatrixReadOnly(transform);
    const transformFinal=!matrix||(Math.abs(matrix.m42)<.1&&Math.abs(matrix.a-1)<.001&&Math.abs(matrix.d-1)<.001);
    return { transform, transformFinal, root: parseFloat(getComputedStyle(document.documentElement).fontSize), fonts, bad, top: modal.top, bottom: modal.bottom, overflow: document.documentElement.scrollWidth - innerWidth, actionPosition: getComputedStyle(e.querySelector(".account-delete-actions")).position };
}

export async function readFinalAccountDeletionGeometry(dialog,height) {
  let geometry;
  // Observe pose and bounds in the same sample. A prior identity-transform check
  // can finish before Motion's next JavaScript frame writes the entrance pose.
  try {await expect.poll(async()=>{
    geometry=await dialog.evaluate(measureAccountDeletionGeometry);
    return geometry.transformFinal&&geometry.top>=13&&geometry.bottom<=height-13;
  // Keep the original one-second deadline, but sample often enough that a
  // 500ms entrance can finish between polls without the next IPC crossing it.
  },{timeout:1000,intervals:[16,32,50]}).toBe(true);} catch(error) {
    error.message+='\nLast atomic dialog geometry: '+JSON.stringify(geometry);
    throw error;
  }
  return geometry;
}
