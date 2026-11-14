const windowParameters = new URLSearchParams(window.location.search);

/** The desktop output uses the same renderer with only its presentation surface enabled. */
export const isPresentationWindow = windowParameters.get('present') === '1';

/** Ordinary Windows output uses OS dragging and frame-edge resizing instead of pointer IPC. */
export const isNativePresentationWindow = isPresentationWindow && windowParameters.get('window-kind') === 'native';
