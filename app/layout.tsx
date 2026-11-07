import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Highlevel Leads — Your next connection starts here',
  description: 'A shared workspace for lead research, outreach, audits, and team performance.',
  icons: {icon:'/favicon.svg'},
};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}
