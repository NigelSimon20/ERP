import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'Ravenshield Security ERP',
  description: 'Enterprise resource planning for security companies',
}

const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('ravenshield-theme');
    var isDark = stored === 'dark';
    if (isDark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
