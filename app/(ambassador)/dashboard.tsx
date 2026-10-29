import React from 'react';
import { Redirect } from 'expo-router';

/**
 * Compatibility route for saved links from the former limited Ambassador
 * Console. Active ambassadors now use the complete campus-admin workspace.
 */
export default function AmbassadorDashboardRedirect() {
  return <Redirect href={'/(admin)/dashboard' as any} />;
}
