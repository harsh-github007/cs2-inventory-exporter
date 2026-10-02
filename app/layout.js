import './globals.css';

export const metadata = {
  metadataBase: new URL('https://cs2-inventory-exporter-auxo.vercel.app'),
  openGraph: { type: 'website', url: '/', title: 'CS2 Inventory Exporter', description: 'Export any public Counter-Strike 2 inventory to CSV, with names, wear, rarity, collection and trade status.', images: [{ url: '/og.png?v=2', width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image' },
  title: 'CS2 Inventory Exporter',
  description: 'Export any public Counter-Strike 2 inventory to CSV, with names, wear, rarity, collection and trade status.',
};

export const viewport = { themeColor: '#eeede9', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en">

      <body>{children}</body>
    </html>
  );
}
