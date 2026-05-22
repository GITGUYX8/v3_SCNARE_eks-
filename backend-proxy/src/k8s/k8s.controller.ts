import { Controller, Post, Body, Delete, Param } from '@nestjs/common';
import { K8sService } from './k8s.service';

@Controller('api/labs')
export class K8sController {
  constructor(private readonly k8sService: K8sService) {}

  @Post('launch')
  async launchLab(@Body('studentId') studentId: string) {
    // Note: Later, adding NestJS Guards (@UseGuards) here 
    // to verify the JWT token before allowing this function to run.
    return await this.k8sService.provisionStudentLab(studentId);
  }

  @Delete('stop/:studentId')
  async stopLab(@Param('studentId') studentId: string) {
    return await this.k8sService.terminateStudentLab(studentId);
  }
}