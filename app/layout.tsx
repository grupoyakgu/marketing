import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Grupo YAKGU — Social Dashboard',
  description: 'Social media management dashboard for Grupo YAKGU',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = cookies().get('theme')?.value === 'dark' ? 'dark' : '';

  return (
    <html lang="en" className={`${inter.variable} ${theme}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
