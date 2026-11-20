import type { Metadata } from 'next'
import { Nunito_Sans } from 'next/font/google'
import localFont from 'next/font/local'
import './globals.css'
import { Providers } from './providers'

// Infinity Nexa brand fonts (www.infinitynexa.co.zw): Nunito Sans for text,
// Chillax for headings. next/font self-hosts both, so no request leaves the app.
const nunitoSans = Nunito_Sans({ subsets: ['latin'], variable: '--font-nunito-sans', display: 'swap', adjustFontFallback: false })
const chillax = localFont({
  src: [
    { path: './fonts/Chillax-400.woff2', weight: '400' },
    { path: './fonts/Chillax-500.woff2', weight: '500' },
    { path: './fonts/Chillax-600.woff2', weight: '600' },
    { path: './fonts/Chillax-700.woff2', weight: '700' },
  ],
  variable: '--font-chillax',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'Infinity Nexa ERP', template: '%s · Infinity Nexa ERP' },
  description: 'Infinity Nexa ERP: finance, payroll, HR and operations for security companies',
  applicationName: 'Infinity Nexa ERP',
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
    <html lang="en" className={`${nunitoSans.variable} ${chillax.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
