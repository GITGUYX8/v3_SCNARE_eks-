import { Injectable, Logger } from '@nestjs/common';
import * as k8s from '@kubernetes/client-node';

@Injectable()
export class K8sService {
  private readonly logger = new Logger(K8sService.name);
  private k8sApi: k8s.CoreV1Api;
  private netApi: k8s.NetworkingV1Api; // <-- Add this) 
  constructor() {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault(); 
    this.k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    this.netApi = kc.makeApiClient(k8s.NetworkingV1Api); // <-- Add this
    }
  

  async provisionStudentLab(studentId: string) {
    const namespaceName = `lab-${studentId.toLowerCase()}`;
    this.logger.log(`Provisioning secure lab for ${studentId} in namespace ${namespaceName}`);

    try {
      // 1. ISOLATION: Create a dedicated Namespace for this student
      await this.k8sApi.createNamespace({
        body: {
            metadata: { name: namespaceName }
            }
        });
    const serviceManifest: k8s.V1Service = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: 'ros2-service' },
        spec: {
          selector: { app: 'ros2-student-lab', student: studentId }, // Connects to the Pod's labels
          ports: [
            { name: 'gui', port: 6090, targetPort: 6090 },
            { name: 'terminal', port: 8080, targetPort: 8080 }
          ],
        },
      };
      await this.k8sApi.createNamespacedService({ 
        namespace: namespaceName, 
        body: serviceManifest 
      });

      // 5. CREATE INGRESS: Tell Nginx to route /studentId/gui to the Service
      const ingressManifest: k8s.V1Ingress = {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'Ingress',
        metadata: {
          name: 'ros2-ingress',
          annotations: {
            // This tells Nginx to strip the /yash-001/gui part from the URL 
            // before sending it to the container, so the container just sees "/"
            'nginx.ingress.kubernetes.io/rewrite-target': '/$2'
          }
        },
        spec: {
          ingressClassName: 'nginx',
          rules: [{
            http: {
              paths: [{
                path: `/${studentId.toLowerCase()}/gui(/|$)(.*)`,
                pathType: 'Prefix',
                backend: {
                  service: { name: 'ros2-service', port: { number: 6090 } }
                }
              }]
            }
          }]
        }
      };
      await this.netApi.createNamespacedIngress({ 
        namespace: namespaceName, 
        body: ingressManifest 
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
              image: 'nano-ros:latest', // We will build this locally next
              imagePullPolicy: 'IfNotPresent', // CRITICAL: Tells K8s to use your local cache
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
      await this.k8sApi.createNamespacedPod({namespace : namespaceName, body : podManifest});

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
      await this.k8sApi.deleteNamespace({name : namespaceName});
      this.logger.log(`Terminated all resources for ${studentId}`);
      return { status: 'terminated' };
    } catch (error) {
      this.logger.error(`Failed to terminate lab for ${studentId}`, error);
      throw new Error('Cleanup failed.');
    }
  }
}