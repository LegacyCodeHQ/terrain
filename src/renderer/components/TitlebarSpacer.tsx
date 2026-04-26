/**
 * Empty top strip shown when there are no tabs. Reserves space for the
 * macOS traffic-light controls and acts as a draggable region (via the
 * `.titlebar-spacer` class in App.css).
 */
export function TitlebarSpacer() {
  return <div className="titlebar-spacer" aria-hidden="true" />;
}
