import React from'react';
import { View } from'react-native';
import { EventCard } from'./EventCard';
import { EmptyState } from'./EmptyState';
import { CampusEvent } from'@/api/types';

export function AgendaList({ events }: { events: CampusEvent[] }) {
  const sorted = [...events].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  if (sorted.length === 0) {
    return <EmptyState title="No upcoming events"description="Your agenda is clear." />;
  }

  return (
    <View>
      {sorted.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </View>
  );
}
