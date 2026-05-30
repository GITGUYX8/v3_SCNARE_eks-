import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WellKnownController } from './auth/well-known.controller';
import { AuthModule } from './auth/auth.module';
import { K8sService } from './k8s/k8s.service';
import { K8sController } from './k8s/k8s.controller';

@Module({
  // Combine all required module imports
  imports: [
    AuthModule
  ],
  // Route all controllers through this single array
  controllers: [
    AppController, 
    K8sController, 
    WellKnownController
  ],
  // Provide all shared services here
  providers: [
    AppService, 
    K8sService
  ],
})
export class AppModule {}