import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TeamUP — Your group, on the same page',
  description:
    'Plan group projects, share tasks, track milestones, and find time to work together.',
  other: {
    'codex-preview': 'development',
  },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en'>
      <body className='antialiased'>{children}</body>
    </html>
  );
}
