import { h, render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Carousel } from './carousel';
import { MapView } from './map-view';
import { getTheme, onUpdate, readEvents } from './bridge';
import type { EventSummary } from './types';

type View = 'list' | 'map';

function App() {
  const [events, setEvents] = useState<EventSummary[]>(readEvents());
  const [theme, setTheme] = useState<'light' | 'dark'>(getTheme());
  const [view, setView] = useState<View>('list');

  useEffect(() => {
    onUpdate(() => {
      setEvents(readEvents());
      setTheme(getTheme());
    });
  }, []);

  const hasCoords = events.some(
    (event) => event.latitude !== null && event.longitude !== null,
  );

  if (!events.length) {
    return (
      <div class="empty">
        Keine passenden Events gefunden. Versuche eine andere Suche.
      </div>
    );
  }

  return (
    <div class={`app theme-${theme}`}>
      <div class="toolbar">
        <span class="count">{events.length} Events</span>
        {hasCoords ? (
          <div class="toggle" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'list'}
              class={view === 'list' ? 'active' : ''}
              onClick={() => setView('list')}
            >
              Liste
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'map'}
              class={view === 'map' ? 'active' : ''}
              onClick={() => setView('map')}
            >
              Karte
            </button>
          </div>
        ) : null}
      </div>
      {view === 'map' && hasCoords ? (
        <MapView events={events} theme={theme} />
      ) : (
        <Carousel events={events} />
      )}
    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  render(<App />, root);
}
