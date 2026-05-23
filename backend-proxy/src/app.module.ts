import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// 1. Import your new modules here
import { AuthModule } from './auth/auth.module';
import { K8sService } from './k8s/k8s.service';
import { K8sController } from './k8s/k8s.controller';

@Module({
  // 2. Add AuthModule to the imports array!
  imports: [AuthModule],
  // 3. Register your K8s controller and service here (unless you made a separate K8sModule)
  controllers: [AppController, K8sController],
  providers: [AppService, K8sService],
})
export class AppModule {}