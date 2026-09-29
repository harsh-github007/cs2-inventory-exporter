import './globals.css';

export const metadata = {
  title: 'CS2 Inventory Exporter',
  description: 'Export any public Counter-Strike 2 inventory to CSV, with names, wear, rarity, collection and trade status.',
};

export const viewport = { themeColor: '#0B0B0C', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* This is the root layout, so the font loads on every page; the rule targets the old pages router */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
