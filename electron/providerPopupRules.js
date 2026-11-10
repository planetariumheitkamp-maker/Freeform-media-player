export const VIDRIFT_POPUP_PROBE_FEATURES = 'width=1,height=1,left=-9999,top=-9999';

// Vidrift checks this exact native popup once, inside a real click. Electron
// normalizes the special `_blank` target to an empty frameName in HandlerDetails.
// Keep this exception narrower than a hostname or a general blank-popup rule.
export function isVidriftPopupCapabilityProbe(providerId, details) {
  return providerId === 'vidrift'
    && (details?.url === 'about:blank' || details?.url === '')
    && details?.frameName === ''
    && details?.features === VIDRIFT_POPUP_PROBE_FEATURES
    && details?.disposition === 'new-window';
}
