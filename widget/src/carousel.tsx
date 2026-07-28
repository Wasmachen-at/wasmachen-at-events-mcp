import { h } from 'preact';
import type { EventSummary } from './types';
import { openExternal } from './bridge';
import { formatDate, initialFor } from './format';

function EventCard({ event }: { event: EventSummary }) {
  const dateLabel = formatDate(event.startDateTime);
  const location = [event.venueName, event.city].filter(Boolean).join(', ');

  return (
    <article class="card">
      <div class="card-image">
        {event.imageUrl ? (
          <img
            src={event.imageUrl}
            alt={event.name}
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div class="card-image-fallback" aria-hidden="true">
            {initialFor(event.name)}
          </div>
        )}
      </div>
      <div class="card-body">
        {dateLabel ? <div class="card-date">{dateLabel}</div> : null}
        <h3 class="card-title">{event.name}</h3>
        {location ? <div class="card-location">{location}</div> : null}
        {event.teaser ? <p class="card-teaser">{event.teaser}</p> : null}
        <button
          type="button"
          class="card-link"
          onClick={() => openExternal(event.url)}
        >
          Auf wasmachen.at ansehen →
        </button>
      </div>
    </article>
  );
}

export function Carousel({ events }: { events: EventSummary[] }) {
  return (
    <div class="carousel" role="list">
      {events.map((event) => (
        <div role="listitem" key={event.id}>
          <EventCard event={event} />
        </div>
      ))}
    </div>
  );
}
