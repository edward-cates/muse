import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const CSP_PROD = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss: https:; img-src 'self' data: https:; frame-src blob:"
const CSP_DEV = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss: http: https:; img-src 'self' data: https:; frame-src blob:"

function cspPlugin(): Plugin {
  return {
    name: 'csp',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const csp = ctx.server ? CSP_DEV : CSP_PROD
        return html.replace('__CSP__', csp)
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), cspPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4444',
        changeOrigin: true,
      },
    },
  },
})
