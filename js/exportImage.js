// exportImage.js — turn the live circuit SVG into a downloadable PNG
// snapshot ("show off what you built"). One tricky part: an
// `<img src="data:image/svg+xml...">` can't resolve this app's CSS custom
// properties (var(--accent), color-mix(), whichever of the 5 themes is
// active) — only literal attributes survive that trip. So every element's
// *computed*, already-resolved fill/stroke gets baked in as a plain
// attribute on a clone before it's serialized, rather than trying to ship
// the stylesheet along with it.
const SVGNS = 'http://www.w3.org/2000/svg';

export function exportSvgAsPng(svgEl, filename, bgColor) {
  const baseW = svgEl.viewBox.baseVal.width || parseFloat(svgEl.getAttribute('width'));
  const baseH = svgEl.viewBox.baseVal.height || parseFloat(svgEl.getAttribute('height'));

  const clone = svgEl.cloneNode(true);
  clone.setAttribute('width', baseW);
  clone.setAttribute('height', baseH);

  // Transient UI-only bits (an in-progress wire drag, a spark burst, the
  // dashed "selected" outline) shouldn't show up in a shareable snapshot.
  clone.querySelectorAll('.temp-layer, .fx-layer, .select-outline').forEach(el => el.remove());
  clone.querySelectorAll('.component.selected').forEach(el => el.classList.remove('selected'));

  // Walking the live tree and the clone in lockstep works because
  // cloneNode(true) preserves element order exactly.
  const liveEls = svgEl.querySelectorAll('*');
  const cloneEls = clone.querySelectorAll('*');
  liveEls.forEach((el, i) => {
    const target = cloneEls[i];
    if (!target) return;
    const cs = getComputedStyle(el);
    if (cs.fill && cs.fill !== 'none') target.setAttribute('fill', cs.fill);
    if (cs.stroke && cs.stroke !== 'none') target.setAttribute('stroke', cs.stroke);
    if (cs.strokeWidth) target.setAttribute('stroke-width', cs.strokeWidth);
    if (cs.strokeDasharray && cs.strokeDasharray !== 'none') target.setAttribute('stroke-dasharray', cs.strokeDasharray);
    if (cs.opacity) target.setAttribute('opacity', cs.opacity);
  });

  const bgRect = document.createElementNS(SVGNS, 'rect');
  bgRect.setAttribute('x', 0);
  bgRect.setAttribute('y', 0);
  bgRect.setAttribute('width', baseW);
  bgRect.setAttribute('height', baseH);
  bgRect.setAttribute('fill', bgColor || '#ffffff');
  clone.insertBefore(bgRect, clone.firstChild);

  const svgString = new XMLSerializer().serializeToString(clone);
  const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = baseW;
      canvas.height = baseH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, baseW, baseH);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('toBlob failed')); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        resolve();
      }, 'image/png');
    };
    img.onerror = reject;
    img.src = svgUrl;
  });
}
