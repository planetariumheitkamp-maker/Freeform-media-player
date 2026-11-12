/** The desktop output uses the same renderer with only its presentation surface enabled. */
export const isPresentationWindow = new URLSearchParams(window.location.search).get('present') === '1';
