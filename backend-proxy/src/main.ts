import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { K8sService } from './k8s/k8s.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  const k8sService = app.get(K8sService);

  // 1. Define the proxy rules
  const proxy = createProxyMiddleware({
    router: async () => {
      const liveUrl = await k8sService.getMasterGatewayUrl();
      return liveUrl || 'http://localhost:8080';
    },
    changeOrigin: true,
    ws: true,
    on: {
      // 2. Intercept outgoing HTTP requests
      proxyReq: (proxyReq, req: any) => {
        let token = req.query?.access_token;

        // If token isn't in URL, check if we saved it in a cookie
        if (!token && req.headers.cookie) {
          const cookies = req.headers.cookie.split(';');
          const tokenCookie = cookies.find(c => c.trim().startsWith('lab_token='));
          if (tokenCookie) token = tokenCookie.split('=')[1];
        }

        // Inject the Zero Trust Header
        if (token) {
          proxyReq.setHeader('Authorization', `Bearer ${token}`);
        }
      },
      // 3. Intercept incoming responses
      proxyRes: (proxyRes, req: any) => {
        // If the URL had a token, save it in the browser invisibly for future JS/CSS/WS requests
        if (req.query?.access_token) {
          proxyRes.headers['set-cookie'] = [
            `lab_token=${req.query.access_token}; Path=/; HttpOnly; SameSite=None; Secure`
          ];
        }
      },
      // 4. Intercept the WebSocket Upgrade
      proxyReqWs: (proxyReq, req: any) => {
        let token = null;
        if (req.headers.cookie) {
          const cookies = req.headers.cookie.split(';');
          const tokenCookie = cookies.find(c => c.trim().startsWith('lab_token='));
          if (tokenCookie) token = tokenCookie.split('=')[1];
        }
        if (token) {
          proxyReq.setHeader('Authorization', `Bearer ${token}`);
        }
      },
      error: (err, req, res: any) => {
        console.error('Proxy error:', err.message);
        if (!res.headersSent) {
          res.writeHead?.(502, { 'Content-Type': 'application/json' });
          res.end?.(JSON.stringify({ error: 'Proxy error', message: err.message }));
        }
      },
    },
  });

  // 5. Mount the proxy dynamically for ANY route containing '/gui'
  app.use((req, res, next) => {
    if (req.path.includes('/gui')) {
      return proxy(req, res, next);
    }
    next();
  });

  await app.listen(3000);
}
bootstrap();