import './globals.css';
import { Toaster } from 'sonner';

export const metadata = {
  title: 'TempShare — Share files that vanish in 5 minutes',
  description: 'Drag, drop, and share. Your file gets a private link that auto-deletes in 5 minutes.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
