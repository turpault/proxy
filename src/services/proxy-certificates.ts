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
    logger.info('Setting up SSL certificates...');
    
    // Create certificates directory if it doesn't exist
    await fs.ensureDir(this.config.letsEncrypt.certDir);
    
    // Initialize Let's Encrypt service
    await this.letsEncryptService.initialize();
    
    // Set up certificates for each domain
    for (const route of this.config.routes) {
      if (route.ssl !== false) { // Default to SSL unless explicitly disabled
        await this.setupCertificateForDomain(route.domain);
      }
    }
    
    // Set up certificate renewal
    this.setupCertificateRenewal();
    
    logger.info(`SSL certificates setup complete for ${this.certificates.size} domains`);
  }

  private async setupCertificateForDomain(domain: string): Promise<void> {
    try {
      // Check if certificate already exists and is valid
      const existingCertInfo = await this.letsEncryptService.getCertificateInfo(domain);
      
      if (existingCertInfo && existingCertInfo.isValid) {
        this.certificates.set(domain, existingCertInfo);
        logger.info(`Using existing certificate for ${domain} (expires: ${existingCertInfo.expiresAt.toISOString()})`);
        return;
      }
      
      // Generate new certificate
      logger.info(`Generating new certificate for ${domain}...`);
      const certInfo = await this.letsEncryptService.obtainCertificate(domain);
      
      this.certificates.set(domain, certInfo);
      logger.info(`Certificate generated successfully for ${domain} (expires: ${certInfo.expiresAt.toISOString()})`);
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
    const httpsOptions: https.ServerOptions = {
      // Use a default certificate for the server
      // Individual domain certificates will be handled by SNI
    };
    
    const server = https.createServer(httpsOptions, app);
    
    // Set up SNI (Server Name Indication) for multiple certificates
    server.addListener('SNICallback', (servername, cb) => {
      const certInfo = this.getCertificate(servername);
      
      if (certInfo) {
        try {
          const cert = fs.readFileSync(certInfo.certPath);
          const key = fs.readFileSync(certInfo.keyPath);
          
          cb(null, {
            cert,
            key
          });
        } catch (error) {
          logger.error(`Error loading certificate for ${servername}`, error);
          cb(error);
        }
      } else {
        logger.warn(`No certificate found for ${servername}`);
        cb(new Error(`No certificate found for ${servername}`));
      }
    });
    
    return server;
  }
} 