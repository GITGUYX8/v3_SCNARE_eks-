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
  async getLabUrl(studentId: string): Promise<string> {
    const namespaceName = `lab-${studentId.toLowerCase()}`;
    try {
      const ingress = await this.netApi.readNamespacedIngress({
        name: 'ros2-ingress',
        namespace: namespaceName,
      });
      const hostname = ingress.status?.loadBalancer?.ingress?.[0]?.hostname;
      if (hostname) return `http://${hostname}`;
      throw new Error('ALB hostname not yet assigned');
    } catch (err) {
      this.logger.error('Could not get lab URL', err);
      throw err;
    }
}
  async getMasterGatewayUrl(): Promise<string | null> {
    try {
      // List all namespaces that start with 'lab-'
      const namespaces = await this.k8sApi.listNamespace();
      const labNamespaces = namespaces.items
        .map(ns => ns.metadata?.name)
        .filter(name => name?.startsWith('lab-'));

      for (const ns of labNamespaces) {
        if (!ns) continue;
        try {
          const ingress = await this.netApi.readNamespacedIngress({
            name: 'ros2-ingress',
            namespace: ns,
          });
          const hostname = ingress.status?.loadBalancer?.ingress?.[0]?.hostname;
          if (hostname) {
            this.logger.log(`Found master ALB at: ${hostname} (from namespace ${ns})`);
            return `http://${hostname}`;
          }
        } catch {
          continue;
        }
      }
      return null;
    } catch (err) {
      this.logger.error('Could not find master gateway URL', err);
      return null;
    }
}
async provisionStudentLab(studentId: string) {
    const namespaceName = `lab-${studentId.toLowerCase()}`;
    this.logger.log(`[Orchestrator] Processing provisioning lifecycle for: ${studentId}`);

    // Robust extraction for Kubernetes SDK error codes
    const getK8sStatusCode = (err: any): number => {
      if (err?.response?.statusCode) return err.response.statusCode;
      if (err?.statusCode) return err.statusCode;
      if (err?.body?.code) return err.body.code;
      if (typeof err?.body === 'string') {
        try {
          const parsed = JSON.parse(err.body);
          if (parsed.code) return parsed.code;
        } catch {}
      }
      return 0;
    };

    try {
      // 1. NAMESPACE LIFECYCLE (Preserve or create)
      try {
        await this.k8sApi.createNamespace({ body: { metadata: { name: namespaceName } } });
        this.logger.log(`Created fresh infrastructure boundary [Namespace: ${namespaceName}]`);
      } catch (err: any) {
        if (getK8sStatusCode(err) !== 409) throw err;
        this.logger.log(`Infrastructure boundary verified [Namespace: ${namespaceName}]`);
      }

      // 2. NETWORK ROUTING LIFECYCLE (Preserve or create)
      const serviceManifest: k8s.V1Service = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: 'ros2-service' },
        spec: {
          type: 'ClusterIP',
          selector: { app: 'ros2-student-lab', student: studentId },
          ports: [
            { name: 'gui', port: 80, targetPort: 4180 as any },
            { name: 'terminal', port: 8080, targetPort: 8080 as any },
          ],
        },
      };
      try {
        await this.k8sApi.createNamespacedService({ namespace: namespaceName, body: serviceManifest });
        this.logger.log(`Created internal route abstraction [Service: ros2-service]`);
      } catch (err: any) {
        if (getK8sStatusCode(err) !== 409) throw err;
        this.logger.log(`Internal route abstraction verified [Service: ros2-service]`);
      }

      // 3. INGRESS MASTER GATEWAY LIFECYCLE (Preserve domain mapping)
      const ingressManifest: k8s.V1Ingress = {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'Ingress',
        metadata: {
          name: 'ros2-ingress',
          annotations: {
            'alb.ingress.kubernetes.io/scheme': 'internet-facing',
            'alb.ingress.kubernetes.io/target-type': 'ip',
            'alb.ingress.kubernetes.io/group.name': 'ros2-master-gateway',
            'alb.ingress.kubernetes.io/healthcheck-path': '/oauth2/healthz',
            'alb.ingress.kubernetes.io/success-codes': '200',
          },
        },
        spec: {
          ingressClassName: 'alb',
          rules: [
            {
              http: {
                paths: [
                  {
                    path: `/${studentId.toLowerCase()}/gui`,
                    pathType: 'Prefix',
                    backend: {
                      service: { name: 'ros2-service', port: { number: 80 } },
                    },
                  },
                ],
              },
            },
          ],
        },
      };
      try {
        await this.netApi.createNamespacedIngress({ namespace: namespaceName, body: ingressManifest });
        this.logger.log(`Created ingress proxy edge rule [Ingress: ros2-ingress]`);
      } catch (err: any) {
        if (getK8sStatusCode(err) !== 409) throw err;
        this.logger.log(`Ingress proxy edge rule verified [Ingress: ros2-ingress]`);
      }

      // 4. COMPUTE LIFECYCLE (Force kill old compute instances to reload clean system state)
      try {
        this.logger.log(`Purging stale compute runtime workloads...`);
        await this.k8sApi.deleteNamespacedPod({ name: 'ros2-workspace', namespace: namespaceName });
        
        // Block execution thread briefly to clear space on the worker node
        await new Promise((resolve) => setTimeout(resolve, 4000));
      } catch (err: any) {
        // 404 is expected if the student is logging in for the first time or pod was already dead
        if (getK8sStatusCode(err) !== 404) throw err;
      }

      // 5. DEPLOY SECURE LAB HARDWARE WORKLOAD
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
                '--http-address=0.0.0.0:4180',
                '--upstream=http://127.0.0.1:8080',
                '--upstream-timeout=120s',
                '--provider=oidc',
                '--oidc-issuer-url=https://interdentally-moderne-taunya.ngrok-free.dev',
                '--client-id=ros2-lab-platform',
                '--client-secret=unused',
                '--skip-jwt-bearer-tokens=true',
                '--extra-jwt-issuers=https://interdentally-moderne-taunya.ngrok-free.dev=ros2-lab-platform',
                '--oidc-email-claim=sub',
                '--email-domain=*',
                '--skip-provider-button=true',
                '--set-authorization-header=true',
                '--pass-authorization-header=true',
                '--cookie-secret=MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=',
                '--cookie-secure=false',
                '--ping-path=/oauth2/healthz',
              ],
              ports: [{ containerPort: 4180 }],
              resources: {
                requests: { cpu: '100m', memory: '128Mi' },
                limits: { cpu: '200m', memory: '256Mi' },
              },
            },
            {
              name: 'rviz2-container',
              image: '221131121759.dkr.ecr.ap-northeast-1.amazonaws.com/nano-ros:latest',
              imagePullPolicy: 'Always',
              command: ['ttyd'],
              args: [
                '-b',
                `/${studentId.toLowerCase()}/gui`,
                '-p',
                '8080',
                'bash',
              ],
              ports: [{ containerPort: 8080 }],
              resources: {
                requests: { cpu: '500m', memory: '1Gi' },
                limits: { cpu: '1000m', memory: '2Gi' },
              },
              securityContext: {
                allowPrivilegeEscalation: false,
                capabilities: { drop: ['ALL'] },
              },
            },
          ],
        },
      };

      try {
        await this.k8sApi.createNamespacedPod({ namespace: namespaceName, body: podManifest });
        this.logger.log(`Dispatched fresh compute instance [Pod: ros2-workspace]`);
      } catch (err: any) {
        if (getK8sStatusCode(err) !== 409) throw err;
        this.logger.log(`Compute instance already warm. Overriding allocation handler.`);
      }

      // Short wait block for cluster network mapping
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // 6. INVARIANT DYNAMIC HOSTNAME RETRIEVAL
      let albHostname: string | null = null;
      this.logger.log(`Querying Cloud API Provider for active Ingress route hooks...`);
      
      for (let i = 0; i < 6; i++) {
        try {
          const ingress = await this.netApi.readNamespacedIngress({
            name: 'ros2-ingress',
            namespace: namespaceName,
          });
          albHostname = ingress.status?.loadBalancer?.ingress?.[0]?.hostname ?? null;
          if (albHostname) {
            this.logger.log(`Stable Cloud Routing Endpoint Active: ${albHostname}`);
            break;
          }
        } catch {}
        this.logger.log(`Awaiting endpoint allocation... [Sync loop: ${i + 1}/6]`);
        await new Promise((resolve) => setTimeout(resolve, 4000));
      }

      return {
        status: 'provisioning',
        message: 'Sandbox instance cycle initialized successfully.',
        internalPath: `/${studentId.toLowerCase()}/gui`,
        albUrl: albHostname ? `http://${albHostname}` : null,
      };
    } catch (error: any) {
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