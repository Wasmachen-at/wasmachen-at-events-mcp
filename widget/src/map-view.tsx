import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import * as maplibregl from 'maplibre-gl';
import type { EventSummary } from './types';
import { openExternal } from './bridge';
import { formatDate } from './format';

const STYLE_URL = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

function popupHtml(event: EventSummary): string {
  const dateLabel = formatDate(event.startDateTime);
  const location = [event.venueName, event.city].filter(Boolean).join(', ');
  const escape = (value: string) =>
    value.replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
    );
  return `
    <div class="popup">
      <strong>${escape(event.name)}</strong>
      ${dateLabel ? `<div class="popup-date">${escape(dateLabel)}</div>` : ''}
      ${location ? `<div class="popup-loc">${escape(location)}</div>` : ''}
      <a href="${escape(event.url)}" data-href="${escape(event.url)}" class="popup-link">Auf wasmachen.at ansehen →</a>
    </div>`;
}

export function MapView({
  events,
  theme,
}: {
  events: EventSummary[];
  theme: 'light' | 'dark';
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const located = events.filter(
    (event) => event.latitude !== null && event.longitude !== null,
  );

  useEffect(() => {
    if (!container.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: container.current,
      style: STYLE_URL[theme],
      center: [14.55, 47.6], // roughly the center of Austria
      zoom: 6,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }));

    map.on('load', () => {
      const bounds = new maplibregl.LngLatBounds();
      for (const event of located) {
        const lngLat: [number, number] = [event.longitude!, event.latitude!];
        const popup = new maplibregl.Popup({ offset: 24 }).setHTML(
          popupHtml(event),
        );
        popup.on('open', () => {
          const link = popup
            .getElement()
            ?.querySelector<HTMLAnchorElement>('.popup-link');
          link?.addEventListener('click', (clickEvent) => {
            clickEvent.preventDefault();
            openExternal(link.dataset.href ?? event.url);
          });
        });
        new maplibregl.Marker({ color: '#e2266f' })
          .setLngLat(lngLat)
          .setPopup(popup)
          .addTo(map);
        bounds.extend(lngLat);
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 0 });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Rebuild on data/theme change; located derives from events.
  }, [events, theme]);

  if (!located.length) {
    return (
      <div class="map-empty">
        Für diese Events sind keine Koordinaten verfügbar.
      </div>
    );
  }

  return <div class="map" ref={container} />;
}
