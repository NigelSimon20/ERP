// P0-6. The CSP is report-only for now: watch the browser console for
// violations, then switch the header name to Content-Security-Policy.
// 'unsafe-inline' covers the theme-init script in app/layout.tsx;
// 'unsafe-eval' is needed by next dev only.
const csp = [
	"default-src 'self'",
	`script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"}`,
	"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
	"font-src 'self' data: https://fonts.gstatic.com",
	"img-src 'self' data: blob: https://*.supabase.co",
	"connect-src 'self' https://*.supabase.co wss://*.supabase.co",
	// External portals can open embedded (PortalOpenBehavior.EMBEDDED).
	"frame-src 'self' https:",
	"frame-ancestors 'none'",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
].join('; ')

const securityHeaders = [
	{ key: 'Content-Security-Policy-Report-Only', value: csp },
	{ key: 'X-Frame-Options', value: 'DENY' },
	{ key: 'X-Content-Type-Options', value: 'nosniff' },
	{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
	// geolocation stays available to the app itself for guard clock-in.
	{ key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=(), usb=()' },
	{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
	eslint: {
		ignoreDuringBuilds: true,
	},
	poweredByHeader: false,
	async headers() {
		return [
			{ source: '/:path*', headers: securityHeaders },
			// Authenticated data must never sit in a shared/browser cache.
			{ source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] },
		]
	},
};

export default nextConfig;
