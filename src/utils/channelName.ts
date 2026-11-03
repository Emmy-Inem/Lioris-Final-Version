// A fresh Supabase Realtime channel name per subscription. Pure so node --test can run it.
//
// realtime-js keeps ONE channel object per topic and `supabase.channel(topic)` returns that same object while it is
// still registered. `removeChannel()` is asynchronous (the channel stays registered, in a "leaving" state, until the
// server acknowledges), so closing a channel and immediately asking for one with the same name hands back the dying
// object: the new `.on(...)` handlers attach to it, `.subscribe()` is a no-op on a channel that is leaving, and the
// subscription then closes under the new owner - live updates silently stop. A counter in the name avoids the collision.

let counter = 0;

export function uniqueChannelName(base: string): string {
  counter += 1;
  return `${base}:${counter.toString(36)}`;
}
