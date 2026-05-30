import { Injectable, Logger } from '@nestjs/common';
import * as k8s from '@kubernetes/client-node';

@Injectable()
export class K8sService {
  private readonly logger = new Logger(K8sService.name);
  private k8sApi: k8s.CoreV1Api;
  private netApi: k8s.NetworkingV1Api; 

  constructor() {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault(); 
    this.k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    this.netApi = kc.makeApiClient(k8s.NetworkingV1Api); 
  }

  async provisionStudentLab(studentId: string) {
    const namespaceName = `lab-${studentId.toLowerCase()}`;
    this.logger.log(`Provisioning secure lab for ${studentId} in namespace ${namespaceName}`);

    try {
      // 1. ISOLATION: Create a dedicated Namespace
      try {
        await this.k8sApi.createNamespace({ body: { metadata: { name: namespaceName } } });
      } catch (err: any) {
        if (err.response?.statusCode !== 409) throw err;
      }
      // 2. THE CLOUD HACK: AWS LoadBalancer
      const serviceManifest: k8s.V1Service = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: 'ros2-service' },
        spec: {
          type: 'ClusterIP', // <-- CHANGED: Tells AWS to create a public URL
          selector: { app: 'ros2-student-lab', student: studentId }, 
          ports: [
            { name: 'gui', port: 80, targetPort: 4180 }, // <-- CHANGED: Route to the Bouncer (outh-sidecar port) instead of the app port directly!
            { name: 'terminal', port: 8080, targetPort: 8080 } 
          ],
        },
      };
      try {
        await this.k8sApi.createNamespacedService({ namespace: namespaceName, body: serviceManifest });
      } catch (err: any) {
        if (err.response?.statusCode !== 409) throw err;
      }
      // 2. THE AWS ALB INGRESS (The Master Gateway)
      const ingressManifest: k8s.V1Ingress = {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'Ingress',
        metadata: {
          name: 'ros2-ingress',
          annotations: {
            'alb.ingress.kubernetes.io/scheme': 'internet-facing',
            'alb.ingress.kubernetes.io/target-type': 'ip',
            // THIS IS THE MAGIC: Groups all students onto ONE load balancer!
            'alb.ingress.kubernetes.io/group.name': 'ros2-master-gateway',
            'alb.ingress.kubernetes.io/healthcheck-path': '/ping',
            'alb.ingress.kubernetes.io/success-codes': '200',
          }
        },
        spec: {
          ingressClassName: 'alb', // Tells AWS to take control, not Nginx
          rules: [{
            http: {
              paths: [{
                path: `/${studentId.toLowerCase()}/gui`,
                pathType: 'Prefix',
                backend: {
                  service: { name: 'ros2-service', port: { number: 80 } }
                }
              }]
            }
          }]
        }
      };
      try {
        await this.netApi.createNamespacedIngress({ namespace: namespaceName, body: ingressManifest });
      } catch (err: any) {
        if (err.response?.statusCode !== 409) throw err;
      }
      
      // 4. CLEANUP: Delete any existing stale hardware before booting the new one
      try {
        await this.k8sApi.deleteNamespacedPod({ name: 'ros2-workspace', namespace: namespaceName });
        this.logger.log(`Cleaned up previous hardware for ${studentId}`);
      } catch (err: any) {
        // We expect a 404 here most times (meaning no old pod exists), so we ignore it
      }
      // 3. BLUEPRINT: Pod pointing to AWS ECR
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
              name: 'security-sidecar',
              image: 'quay.io/oauth2-proxy/oauth2-proxy:v7.5.1',
              args: [
              "--http-address=0.0.0.0:4180",
              "--upstream=http://127.0.0.1:8080",
              
              // 1. THE NEW AUTHORITY: Tell it to expect a JWT
              "--provider=oidc",
              "--oidc-issuer-url=https://interdentally-moderne-taunya.ngrok-free.dev", // Your actual backend URL
              "--client-id=ros2-lab-platform", // A static ID you define
              "--client-secret=your-secure-backend-secret", 
              
              // 2. THE SEAMLESS UI: Skip the login button page
              "--skip-provider-button=true",
              
              // 3. THE JWT EXTRACTOR: Tell the sidecar where to find the React token
              "--pass-authorization-header=true",
              "--set-authorization-header=true",
              
              // 4. THE COOKIE ENCRYPTION (Keep this exactly the same)
              "--cookie-secret=00000000000000000000000000000000",
              "--email-domain=*",
              // Tells the sidecar "Do not redirect. Authenticate using the JWT token instead."
              "--skip-jwt-bearer-tokens=true",
            ],
              ports: [{ containerPort: 4180 }],
              resources: {
                requests: { cpu: '100m', memory: '128Mi' }, // Very lightweight
                limits: { cpu: '200m', memory: '256Mi' },
              },
            },
            {
              name: 'rviz2-container', // <-- CHANGED: Point to your Tokyo ECR repository! (Insert your 12-digit AWS ID)
              image: '221131121759.dkr.ecr.ap-northeast-1.amazonaws.com/nano-ros:latest',
              imagePullPolicy: 'Always', // <-- CHANGED: Force EKS to always pull from AWS
              command: ["ttyd"],
              args: ["-b", `/${studentId.toLowerCase()}/gui`, "-p", "8080", "bash"],
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

      await this.k8sApi.createNamespacedPod({namespace : namespaceName, body : podManifest});
      this.logger.log(`Successfully launched pod for ${studentId}. Waiting for AWS ELB...`);

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
      // ONLY delete the Pod. The URL (Ingress) and routing (Service/Namespace) stay alive forever.
      await this.k8sApi.deleteNamespacedPod({ name: 'ros2-workspace', namespace: namespaceName });
      this.logger.log(`Hardware destroyed for ${studentId}. Network preserved.`);
      return { status: 'terminated' };
    } catch (error: any) {
      // If the pod is already gone, don't crash, just report success.
      if (error.response?.statusCode === 404) {
        this.logger.log(`Hardware already destroyed for ${studentId}.`);
        return { status: 'terminated' };
      }
      this.logger.error(`Failed to terminate lab for ${studentId}`, error.body || error);
      throw new Error('Cleanup failed.');
    }
  }
}