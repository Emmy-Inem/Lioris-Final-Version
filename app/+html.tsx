import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * This file is web-only and used to configure the root HTML for every web page.
 * The <head> elements defined here are included on every page for mobile viewports,
 * social media link previews (WhatsApp, Twitter, Facebook, iMessage), and Open Graph cards.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=5, viewport-fit=cover"
        />

        {/* Primary Meta Tags */}
        <title>Lioris | The Unified Campus Network</title>
        <meta name="title" content="Lioris | The Unified Campus Network" />
        <meta
          name="description"
          content="Connect with verified university students and alumni. Access course past questions, academic forums, campus events, and career mentorship."
        />
        <meta name="theme-color" content="#080E1A" />

        {/* Open Graph / Facebook / WhatsApp / Telegram / iMessage */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://lioris-campus.vercel.app" />
        <meta property="og:site_name" content="Lioris" />
        <meta property="og:title" content="Lioris | The Unified Campus Network" />
        <meta
          property="og:description"
          content="Connect with verified university students and alumni. Access course past questions, academic forums, campus events, and career mentorship."
        />
        <meta property="og:image" content="https://lioris-campus.vercel.app/og-image.jpg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="Lioris Campus Network" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content="https://lioris-campus.vercel.app" />
        <meta name="twitter:title" content="Lioris | The Unified Campus Network" />
        <meta
          name="twitter:description"
          content="Connect with verified university students and alumni. Access course past questions, academic forums, campus events, and career mentorship."
        />
        <meta name="twitter:image" content="https://lioris-campus.vercel.app/og-image.jpg" />
        {/* Favicons, Apple Touch Icon, and Web App Manifest */}
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="shortcut icon" href="/favicon.png" type="image/png" />
        {/* The `react-native-web` recommended style reset */}
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
