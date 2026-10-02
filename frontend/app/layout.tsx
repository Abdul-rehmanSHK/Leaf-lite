import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LeafLite - High Performance Image Optimization & Conversion',
  description: 'Stateless, blazing-fast image compressor and converter with batch processing and ZIP download.',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🍃</text></svg>'
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#fafbfc] text-slate-800 antialiased selection:bg-emerald-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
