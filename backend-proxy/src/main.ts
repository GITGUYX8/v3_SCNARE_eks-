import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // ADD THIS LINE: Allow your future frontend to talk to this API
  app.enableCors(); 
  
  await app.listen(3000);
}
bootstrap();