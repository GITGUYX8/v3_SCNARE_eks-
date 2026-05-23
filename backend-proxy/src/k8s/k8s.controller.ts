import { Controller, Post, Delete, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { K8sService } from './k8s.service';

@Controller('api/labs')
export class K8sController {
  constructor(private readonly k8sService: K8sService) {}

  // This single decorator acts as a concrete wall. 
  // If the request doesn't have a valid JWT, it throws a 401 Unauthorized automatically.
  @UseGuards(AuthGuard('jwt'))
  @Post('launch')
  async launchLab(@Request() req) {
    // Because the JWT Strategy validated the token, we don't even need the frontend 
    // to send the studentId in the body! We extract it directly from the cryptographically secure token.
    const securedStudentId = req.user.studentId; 
    return await this.k8sService.provisionStudentLab(securedStudentId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('stop')
  async stopLab(@Request() req) {
    const securedStudentId = req.user.studentId;
    return await this.k8sService.terminateStudentLab(securedStudentId);
  }
}   