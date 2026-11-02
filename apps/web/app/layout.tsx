import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/toast';

export const metadata: Metadata = {
  title: 'ZAID KHAN — WhatsApp AI Autopilot',
  description:
    'ZAID KHAN is an AI autopilot for WhatsApp: approval-mode replies, a grounding knowledge base and human handoff.',
};

export const viewport: Viewport = {
  themeColor: '#eef6ff',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="min-h-screen bg-[#eef6ff] font-sans"
        style={{ ['--font-jakarta' as string]: "'Plus Jakarta Sans'" }}
      >
        {/* Soft blurred sky-blue backdrop, matching the reference dashboard. */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_8%_0%,#e3f1ff_0%,#f4faff_46%,#ffffff_100%)]" />
          <div className="zk-blob absolute -left-40 -top-32 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(150,205,255,0.55)_0%,rgba(150,205,255,0)_68%)] blur-2xl" />
          <div
            className="zk-blob absolute -right-32 top-10 h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,rgba(46,230,166,0.22)_0%,rgba(46,230,166,0)_70%)] blur-2xl"
            style={{ animationDelay: '-7s' }}
          />
          <div
            className="zk-blob absolute bottom-0 left-1/3 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(59,142,240,0.18)_0%,rgba(59,142,240,0)_72%)] blur-2xl"
            style={{ animationDelay: '-13s' }}
          />
        </div>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
