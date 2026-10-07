// Physical geometry. Every quantity is in millimetres unless named otherwise.
// Calibration: CSS pixels per mm = matched card outside width in CSS px / 85.60.
// Nothing here may use CSS mm units, devicePixelRatio or fit-to-container scaling.
export const CARD = {width: 85.60, height: 53.98}; // ISO/IEC 7810 ID-1
// One compact physical layout for every trial. A above, B left, C right.
export const STAGE = {width: 220, height: 120, positions: {A: [110, 30], B: [55, 77], C: [165, 77]}};
export const LABEL = {offsetAboveMm: 8, fontSizeMm: 4.2};
// CSS pixels reserved around the stage for the header, question and footer.
export const CHROME = {width: 32, height: 90};

export function pixelsPerMm(cardWidthPx) {
  if (!Number.isFinite(cardWidthPx) || cardWidthPx <= 0) throw new Error('Invalid card width');
  return cardWidthPx / CARD.width;
}
export function dimensions(asset, scale) {
  return {width: asset.widthMm * scale, height: asset.heightMm * scale};
}
export function fits(scale, width, height) {
  return STAGE.width * scale <= width - CHROME.width && STAGE.height * scale <= height - CHROME.height;
}
export function requiredPixels(scale) {
  return {width: Math.ceil(STAGE.width * scale + CHROME.width), height: Math.ceil(STAGE.height * scale + CHROME.height)};
}
// Reported screen properties that invalidate a calibration when they change.
// A screen switch with identical reported properties cannot be detected this way.
export function changedScreen(before, after) {
  return ['dpr', 'screenWidth', 'screenHeight', 'visualScale'].some(k => Math.abs(before[k] - after[k]) > .001);
}
// Safari keeps devicePixelRatio constant under page zoom. There, zoom changes
// the viewport width (innerWidth) while the window width (outerWidth) and the
// full-screen state stay the same; a plain window resize changes both.
export function zoomSuspected(before, after) {
  if (!Number.isFinite(before.outerWidth) || !Number.isFinite(after.outerWidth) || !before.outerWidth) return false;
  if (before.fullscreen !== after.fullscreen) return false;
  return Math.abs(after.outerWidth - before.outerWidth) < 1 && Math.abs(after.innerWidth - before.innerWidth) > 1;
}
