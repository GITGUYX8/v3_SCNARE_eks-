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
            { name: 'gui', port: 80, targetPort: 8080 },
            { name: 'terminal', port: 8080, targetPort: 8080 }
          ],
        },
      };
      await this.k8sApi.createNamespacedService({ 
        namespace: namespaceName, 
        body: serviceManifest 
      });
      
// 5. CREATE INGRESS: Clean, simple prefix routing
      const ingressManifest: k8s.V1Ingress = {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'Ingress',
        metadata: {
          name: 'ros2-ingress',
          // We completely deleted the rewrite-target and regex annotations!
        },
        spec: {
          ingressClassName: 'nginx',
          rules: [{
            http: {
              paths: [{
                path: `/${studentId.toLowerCase()}/gui`, // Clean path
                pathType: 'Prefix',
                backend: {
                  service: { name: 'ros2-service', port: { number: 80 } }
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
          activeDeadlineSeconds: 14400,
          containers: [
            {
              name: 'rviz2-container',
              image: 'nano-ros:latest',
              imagePullPolicy: 'IfNotPresent',
              
              // --- THE FIX: Tell ttyd exactly where it is hosted! ---
              command: ["ttyd"],
              args: ["-b", `/${studentId.toLowerCase()}/gui`, "-p", "8080", "bash"],
              // ------------------------------------------------------
              
              ports: [{ containerPort: 8080 }],
              resources: {
                requests: { cpu: '500m', memory: '1Gi' },
                limits: { cpu: '1000m', memory: '2Gi' },
              },
              securityContext: {
                allowPrivilegeEscalation: false,
                capabilities: { drop: ['ALL'] }
              },
            },
          ],
        },
      };

      // EXECUTION: Send the command to Kubernetes
      await this.k8sApi.createNamespacedPod({namespace : namespaceName, body : podManifest});
      this.logger.log(`Successfully launched pod for ${studentId}. Waiting for Nginx routing table to sync...`);

      // --- THE RACE CONDITION FIX ---
      // Force the backend to wait 5 seconds so Nginx has time to open the routing gate
      await new Promise(resolve => setTimeout(resolve, 5000));

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