export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: process.env.NODE_ENV !== 'production' },
  css: ['~/assets/css/main.css'],
  typescript: { strict: true, typeCheck: true },
  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL,
    sessionSecret: process.env.SESSION_SECRET,
    public: {
      appUrl: process.env.APP_URL || 'http://localhost:3000',
    },
  },
  nitro: {
    preset: 'vercel',
    routeRules: {
      '/**': {
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
          'Cross-Origin-Resource-Policy': 'same-origin',
          'X-Permitted-Cross-Domain-Policies': 'none',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        },
      },
      '/api/**': {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    },
  },
});
