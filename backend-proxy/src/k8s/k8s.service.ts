import { Injectable, Logger } from '@nestjs/common';
import * as k8s from '@kubernetes/client-node';

@Injectable()
export class K8sService {
  private readonly logger = new Logger(K8sService.name);
  private k8sApi: k8s.CoreV1Api;

  constructor() {
    const kc = new k8s.KubeConfig();
    //  loads your local ~/.kube/config when testing on locally with minikube or kind,
    // but automatically switches to internal cluster credentials when deployed to AWS
    kc.loadFromDefault(); 
    this.k8sApi = kc.makeApiClient(k8s.CoreV1Api);
  }

  async provisionStudentLab(studentId: string) {
    const namespaceName = `lab-${studentId.toLowerCase()}`;
    this.logger.log(`Provisioning secure lab for ${studentId} in namespace ${namespaceName}`);

    try {
      // 1. ISOLATION: Create a dedicated Namespace for this student
      await this.k8sApi.createNamespace({
        metadata: { name: namespaceName },
      });

      // BLUEPRINT: Pod with strict security and timeouts
      const podManifest: k8s.V1Pod = {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: 'ros2-workspace',
          labels: { app: 'ros2-student-lab', student: studentId },
        },
        spec: {
          // TIMEOUT: Hard kill the pod after exactly 4 hours (14400 seconds)
          activeDeadlineSeconds: 14400,
          containers: [
            {
              name: 'rviz2-container',
              image: 'YOUR_ECR_URI/nano-ros:latest', // We will swap this later
              ports: [{ containerPort: 6090 }, { containerPort: 8080 }],
              // RESOURCE QUOTAS: Prevent the "Noisy Neighbor" crash
              resources: {
                requests: { cpu: '500m', memory: '1Gi' }, // Minimum guaranteed
                limits: { cpu: '1000m', memory: '2Gi' },  // Maximum allowed (Throttled here)
              },

              // SECURITY BASELINE: Prevent Container Escapes
              securityContext: {
                allowPrivilegeEscalation: false,
                runAsNonRoot: true,
                runAsUser: 1000,
                capabilities: { drop: ['ALL'] } // Drops all Linux kernel privileges
              },
            },
          ],
        },
      };

      // EXECUTION: Send the command to Kubernetes
      await this.k8sApi.createNamespacedPod(namespaceName, podManifest);

      this.logger.log(`Successfully launched pod for ${studentId}`);

      return {
        status: 'provisioning',
        message: 'Sandbox created securely.',
        internalPath: `/${studentId}/gui`
      };

    } catch (error) {
      this.logger.error(`Failed to provision lab for ${studentId}`, error.body || error);
      throw new Error('Infrastructure provisioning failed.');
    }
  }

  async terminateStudentLab(studentId: string) {
    const namespaceName = `lab-${studentId.toLowerCase()}`;
    try {
      // Because we put everything in a Namespace, deleting the Namespace
      // automatically destroys the Pod, the Volumes, and the Network rules instantly.
      await this.k8sApi.deleteNamespace(namespaceName);
      this.logger.log(`Terminated all resources for ${studentId}`);
      return { status: 'terminated' };
    } catch (error) {
      this.logger.error(`Failed to terminate lab for ${studentId}`, error);
      throw new Error('Cleanup failed.');
    }
  }
}