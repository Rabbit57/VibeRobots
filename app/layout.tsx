import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ailoGame } from '@/ailo.config';
import './globals.css';

export const metadata: Metadata = {
  title: ailoGame.title,
  description: ailoGame.description,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
