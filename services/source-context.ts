/** Simple global to track which source is currently active in the scan tabs */
let _activeSource = 'nexus';

export function setActiveSource(source: string): void {
  _activeSource = source;
}

export function getActiveSource(): string {
  return _activeSource;
}
