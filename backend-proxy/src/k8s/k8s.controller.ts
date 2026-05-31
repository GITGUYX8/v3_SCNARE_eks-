import { Controller, Post, Delete, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { K8sService } from './k8s.service';

@Controller('api/labs')
export class K8sController {
  constructor(private readonly k8sService: K8sService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('launch')
  async launchLab(@Request() req) {
    // 1. Debugging: Print exactly what Passport extracted from the token
    console.log('Intercepted JWT Payload:', req.user);

    // 2. Bulletproof extraction: check all common property names
    const securedStudentId = req.user?.studentId || req.user?.userId || req.user?.sub;

    if (!securedStudentId) {
      throw new Error('Fatal: Could not extract Student ID from JWT payload.');
    }

    const result = await this.k8sService.provisionStudentLab(securedStudentId);
    return result;
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('stop')
  async stopLab(@Request() req) {
    const securedStudentId = req.user?.studentId || req.user?.userId || req.user?.sub;
    
    if (!securedStudentId) {
      throw new Error('Fatal: Could not extract Student ID from JWT payload.');
    }

    return await this.k8sService.terminateStudentLab(securedStudentId);
  }
}