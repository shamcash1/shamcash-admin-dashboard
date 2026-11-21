import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import apiApp from './api/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Mount API and subscription routes
  app.use((req, res, next) => {
    if (
      req.url &&
      (req.url.startsWith('/sub/') ||
        req.url.startsWith('/happ/') ||
        req.url.startsWith('/pac/') ||
        req.url.startsWith('/api/') ||
        req.url.startsWith('/nodemaven/') ||
        req.url.startsWith('/external-v2ray/') ||
        req.url.startsWith('/customer/') ||
        req.url.startsWith('/store/'))
    ) {
      return (apiApp as any)(req, res, next);
    }
    next();
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
