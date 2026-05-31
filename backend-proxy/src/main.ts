import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { K8sService } from './k8s/k8s.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  const k8sService = app.get(K8sService);

  app.use(
    '/cloud-lab',
    createProxyMiddleware({
      // THE CLOUD HACK: Ask Kubernetes for the live URL dynamically on every connection!
      router: async () => {
        const liveUrl = await k8sService.getMasterGatewayUrl();
        return liveUrl || 'http://localhost:8080';
      },
      changeOrigin: true,
      ws: true,
      pathRewrite: {
        '^/cloud-lab': '',
      },
      on: {
        proxyReq: (proxyReq, req: any) => {
          const token = req.query?.access_token;
          
          if (token) {
            // Simply attach the passport, do not mutate the URL path mid-flight
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
    }),
  );

  await app.listen(3000);
}
bootstrap();