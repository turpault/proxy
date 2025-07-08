import * as fs from 'fs-extra';
import * as path from 'path';
import { CertificateInfo, ProxyConfig } from '../types';
import { logger } from '../utils/logger';
import { LetsEncryptService } from './letsencrypt';

export class ProxyCertificates {
  private static instance: ProxyCertificates | null = null;
  private certificates: Map<string, CertificateInfo> = new Map();
  private letsEncryptService: LetsEncryptService;
  private config: ProxyConfig;
  private isInitialized: boolean = false;

  private constructor(config: ProxyConfig) {
    this.config = config;
    this.letsEncryptService = new LetsEncryptService({
      email: config.letsEncrypt.email,
      staging: config.letsEncrypt.staging,
      certDir: config.letsEncrypt.certDir,
      domains: config.routes.map(route => route.domain),
    });
  }

  /**
   * Get the singleton instance of ProxyCertificates
   * @param config - The proxy configuration (required for first initialization)
   * @returns The singleton instance
   */
  static getInstance(config?: ProxyConfig): ProxyCertificates {
    if (!ProxyCertificates.instance) {
      if (!config) {
        throw new Error('ProxyCertificates.getInstance() requires config parameter for first initialization');
      }
      ProxyCertificates.instance = new ProxyCertificates(config);
    }
    return ProxyCertificates.instance;
  }

  /**
   * Reset the singleton instance (useful for testing or reinitialization)
   */
  static resetInstance(): void {
    ProxyCertificates.instance = null;
  }

  /**
   * Check if the singleton instance exists
   */
  static hasInstance(): boolean {
    return ProxyCertificates.instance !== null;
  }

  async setupCertificates(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('Certificates already initialized, skipping setup');
      return;
    }

    const domains = this.config.routes.map(route => route.domain);
    const uniqueDomains = Array.from(new Set(domains));

    logger.info(`Setting up SSL certificates for ${uniqueDomains.length} domains: ${uniqueDomains.join(', ')}`);

    // Create certificates directory if it doesn't exist
    await fs.ensureDir(this.config.letsEncrypt.certDir);

    // Initialize Let's Encrypt service
    await this.letsEncryptService.initialize();

    // Set up certificates for each domain
    for (const domain of uniqueDomains) {
      if (this.config.routes.find(route => route.domain === domain)?.ssl !== false) { // Default to SSL unless explicitly disabled
        await this.setupCertificateForDomain(domain);
      }
    }

    // Set up certificate renewal
    this.setupCertificateRenewal();

    const validCertificates = Array.from(this.certificates.values()).filter(cert => cert.isValid);
    logger.info(`SSL certificates setup complete. Loaded ${validCertificates.length} valid certificates: ${validCertificates.map(cert => cert.domain).join(', ')}`);

    this.isInitialized = true;
  }

  private async setupCertificateForDomain(domain: string): Promise<void> {
    try {
      logger.debug(`Checking certificate for domain: ${domain}`);

      // Check if certificate already exists and is valid
      const existingCertInfo = await this.letsEncryptService.getCertificateInfo(domain);

      if (existingCertInfo && existingCertInfo.isValid) {
        this.certificates.set(domain, existingCertInfo);
        logger.info(`Using existing certificate for ${domain}`, {
          expiresAt: existingCertInfo.expiresAt,
          certPath: existingCertInfo.certPath,
          keyPath: existingCertInfo.keyPath,
        });
        return;
      }

      // Check if certificate needs renewal
      if (existingCertInfo && await this.letsEncryptService.shouldRenewCertificate(existingCertInfo)) {
        logger.info(`Renewing certificate for ${domain}`);
        const renewedCertInfo = await this.letsEncryptService.renewCertificate(domain);
        if (renewedCertInfo && renewedCertInfo.isValid) {
          this.certificates.set(domain, renewedCertInfo);
          logger.info(`Certificate renewed successfully for ${domain}`, {
            expiresAt: renewedCertInfo.expiresAt,
            certPath: renewedCertInfo.certPath,
            keyPath: renewedCertInfo.keyPath,
          });
          return;
        }
      }

      // Generate new certificate
      logger.info(`Generating new certificate for ${domain}...`);
      const certInfo = await this.letsEncryptService.obtainCertificate(domain);

      if (certInfo && certInfo.isValid) {
        this.certificates.set(domain, certInfo);
        logger.info(`Certificate generated successfully for ${domain}`, {
          expiresAt: certInfo.expiresAt,
          certPath: certInfo.certPath,
          keyPath: certInfo.keyPath,
        });
      } else {
        logger.error(`Failed to obtain valid certificate for ${domain}`);
      }
    } catch (error) {
      logger.error(`Error setting up certificate for ${domain}`, error);
    }
  }

  private setupCertificateRenewal(): void {
    // Set up daily certificate renewal check
    setInterval(async () => {
      logger.debug('Running daily certificate renewal check...');

      for (const [domain, certInfo] of Array.from(this.certificates.entries())) {
        const shouldRenew = await this.letsEncryptService.shouldRenewCertificate(certInfo);

        if (shouldRenew) {
          logger.info(`Certificate for ${domain} needs renewal, renewing...`);
          try {
            const newCertInfo = await this.letsEncryptService.renewCertificate(domain);
            this.certificates.set(domain, newCertInfo);
            logger.info(`Certificate renewed successfully for ${domain}`);
          } catch (error) {
            logger.error(`Failed to renew certificate for ${domain}`, error);
          }
        }
      }
    }, 24 * 60 * 60 * 1000); // Check every 24 hours

    logger.info('Certificate renewal check scheduled (every 24 hours)');
  }

  getCertificate(domain: string): CertificateInfo | undefined {
    return this.certificates.get(domain);
  }

  getAllCertificates(): Map<string, CertificateInfo> {
    return new Map(this.certificates);
  }

  /**
   * Returns Bun-compatible TLS options for a given domain, or null if not available.
   * Usage: Bun.serve({ tls: proxyCertificates.getBunTLSOptions(domain) })
   */
  getBunTLSOptions(domain: string): { key: string; cert: string } | null {
    const certInfo = this.getCertificate(domain);
    if (!certInfo || !certInfo.isValid) return null;
    try {
      const cert = fs.readFileSync(certInfo.certPath, 'utf8');
      const key = fs.readFileSync(certInfo.keyPath, 'utf8');
      return { key, cert };
    } catch (error) {
      logger.error(`Failed to read certificate files for ${domain}`, error);
      return null;
    }
  }
} 