import React from'react';
import { CampusEventsScreen } from'@/components/CampusEventsScreen';

// Deliberately a plain leaf file, not the `events/` directory (which
// still exists and still works for the event-detail push route) - 
// every OTHER role's visible tabs are plain files, and every place in
// this app where"events"is a *visible* Tabs.Screen combined with the
// `events/` directory's own nested Stack layout is where the
// "duplicate screen named'events'"runtime error was reported. Staff
// and alumni keep `events` hidden (href: null) and it's fine; this
// sidesteps the same combination for student's visible tab instead of
// digging further into what's almost certainly an expo-router quirk
// specific to visible+grouped-route screens.
export default function StudentEventsListScreen() {
 return <CampusEventsScreen scope="student" />;
}
