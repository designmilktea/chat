import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const policy = "default-src 'self'; script-src 'self' https://www.gstatic.com https://apis.google.com; connect-src 'self' https://www.gstatic.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://chat-records-683bb.firebaseapp.com; frame-src https://chat-records-683bb.firebaseapp.com https://accounts.google.com https://apis.google.com; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'self'";

export default defineConfig({
  base: '/chat/',
  plugins: [react(), {
    name: 'production-content-security-policy', apply: 'build',
    transformIndexHtml: () => [{tag:'meta', attrs:{'http-equiv':'Content-Security-Policy', content:policy}, injectTo:'head-prepend'}],
  }],
  build: {outDir: 'dist', emptyOutDir: true},
});
