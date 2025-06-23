import * as fs from 'fs-extra';
import * as path from 'path';
import https from 'https';
import express from 'express';
import { CertificateInfo, ServerConfig } from '../types';
import { logger } from '../utils/logger';
import { LetsEncryptService } from './letsencrypt';

export class ProxyCertificates {
  private certificates: Map<string, CertificateInfo> = new Map();
  private letsEncryptService: LetsEncryptService;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    this.letsEncryptService = new LetsEncryptService({
      email: config.letsEncrypt.email,
      staging: config.letsEncrypt.staging,
      certDir: config.letsEncrypt.certDir,
      domains: config.routes.map(route => route.domain),
    });
  }

  async setupCertificates(): Promise<void> {
    const domains = this.config.routes.map(route => route.domain);
    const uniqueDomains = [...new Set(domains)];
    
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
      
      for (const [domain, certInfo] of this.certificates.entries()) {
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

  async startHttpsServer(app: express.Application): Promise<https.Server> {
    // Verify we have valid certificates before starting
    const validCertificates = Array.from(this.certificates.values()).filter(cert => cert.isValid);
    if (validCertificates.length === 0) {
      throw new Error('No valid certificates available for HTTPS server');
    }

    logger.info(`Starting HTTPS server with ${validCertificates.length} certificates for domains: ${Array.from(this.certificates.keys()).join(', ')}`);

    const httpsOptions: https.ServerOptions = {
      // Use the first valid certificate as default
    };
    
    // Use the first valid certificate as default
    const firstCert = validCertificates[0];
    if (firstCert) {
      httpsOptions.cert = fs.readFileSync(firstCert.certPath, 'utf8');
      httpsOptions.key = fs.readFileSync(firstCert.keyPath, 'utf8');
      logger.debug(`Using default certificate for domain: ${firstCert.domain}`);
    }
    
    const server = https.createServer(httpsOptions, app);
    
    // Set up SNI (Server Name Indication) for multiple certificates
    server.addListener('SNICallback', (servername, cb) => {
      logger.debug(`SNI request: ${servername}`);
      const certInfo = this.getCertificate(servername);
      
      if (certInfo && certInfo.isValid) {
        try {
          const cert = fs.readFileSync(certInfo.certPath, 'utf8');
          const key = fs.readFileSync(certInfo.keyPath, 'utf8');
          
          logger.debug(`Loading certificate for SNI request: ${servername}`);
          cb(null, {
            cert,
            key
          });
        } catch (error) {
          logger.error(`Error loading certificate for ${servername}`, error);
          cb(error);
        }
      } else {
        logger.warn(`No valid certificate found for SNI request: ${servername}`);
        cb(new Error(`No valid certificate found for ${servername}`));
      }
    });
    
    return server;
  }
} 