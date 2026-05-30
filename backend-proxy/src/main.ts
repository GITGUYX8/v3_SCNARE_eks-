import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
// 1. Import the proxy tool
import { createProxyMiddleware } from 'http-proxy-middleware'; 

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();

  // 2. THE API GATEWAY REVERSE PROXY
  app.use(
    '/cloud-lab',
    createProxyMiddleware({
      // Replace with your exact AWS ALB URL (No trailing slash)
      target: 'http://k8s-ros2mastergateway-6e2fe3d7f8-797825877.ap-northeast-1.elb.amazonaws.com',
      changeOrigin: true,
      ws: true, // CRITICAL: This allows the ttyd terminal WebSockets to pass through!
      pathRewrite: {
        '^/cloud-lab': '', // Strips '/cloud-lab' from the URL before sending to AWS
      },
      on: {
        proxyReq: (proxyReq, req: any) => {
          if (req.query?.access_token) {
            proxyReq.setHeader('Authorization', `Bearer ${req.query.access_token}`);
          }
        },
      },
    }),
  );

  await app.listen(3000);
}
bootstrap();