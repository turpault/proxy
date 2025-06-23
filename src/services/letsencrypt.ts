import * as acme from 'acme-client';
import * as fs from 'fs-extra';
import * as path from 'path';
import { LetsEncryptOptions, CertificateInfo } from '../types';
import { logger } from '../utils/logger';

export class LetsEncryptService {
  private client: acme.Client | null = null;
  private certDir: string;
  private email: string;
  private staging: boolean;

  constructor(options: LetsEncryptOptions) {
    this.certDir = options.certDir;
    this.email = options.email;
    this.staging = options.staging;
  }

  async initialize(): Promise<void> {
    try {
      // Create directories
      await fs.ensureDir(this.certDir);
      await fs.ensureDir(path.join(this.certDir, 'accounts'));

      // Initialize ACME client
      const directoryUrl = this.staging 
        ? acme.directory.letsencrypt.staging 
        : acme.directory.letsencrypt.production;

      this.client = new acme.Client({
        directoryUrl,
        accountKey: await this.getOrCreateAccountKey(),
      });

      // Create account if it doesn't exist
      await this.createAccount();
      
      logger.info(`Let's Encrypt service initialized (${this.staging ? 'staging' : 'production'})`);
    } catch (error) {
      logger.error('Failed to initialize Let\'s Encrypt service', error);
      throw error;
    }
  }

  private async getOrCreateAccountKey(): Promise<Buffer> {
    const keyPath = path.join(this.certDir, 'accounts', 'account.key');
    
    try {
      return await fs.readFile(keyPath);
    } catch (error) {
      logger.info('Creating new account key');
      const accountKey = await acme.forge.createPrivateKey();
      await fs.writeFile(keyPath, accountKey);
      return accountKey;
    }
  }

  private async createAccount(): Promise<void> {
    if (!this.client) throw new Error('ACME client not initialized');

    try {
      const account = await this.client.createAccount({
        termsOfServiceAgreed: true,
        contact: [`mailto:${this.email}`],
      });
      logger.info('Let\'s Encrypt account created/verified', { account });
    } catch (error: any) {
      if (error.type === 'urn:ietf:params:acme:error:accountDoesNotExist') {
        throw error;
      }
      // Account already exists, continue
      logger.debug('Let\'s Encrypt account already exists');
    }
  }

  async obtainCertificate(domain: string): Promise<CertificateInfo> {
    if (!this.client) throw new Error('ACME client not initialized');

    logger.info(`Obtaining certificate for domain: ${domain}`);

    try {
      // Create private key for certificate
      const [key, csr] = await acme.forge.createCsr({
        commonName: domain,
        altNames: [domain],
      });

      // Request certificate
      const cert = await this.client.auto({
        csr,
        email: this.email,
        termsOfServiceAgreed: true,
        challengeCreateFn: this.createChallenge.bind(this),
        challengeRemoveFn: this.removeChallenge.bind(this),
      });

      // Save certificate and key
      const certInfo = await this.saveCertificate(domain, cert, key);
      
      logger.info(`Certificate obtained successfully for ${domain}`, {
        expiresAt: certInfo.expiresAt,
      });

      return certInfo;
    } catch (error) {
      logger.error(`Failed to obtain certificate for ${domain}`, error);
      throw error;
    }
  }

  private async createChallenge(authz: any, challenge: any, keyAuthorization: string): Promise<void> {
    logger.debug('Creating challenge', { 
      domain: authz.identifier.value, 
      type: challenge.type 
    });

    if (challenge.type === 'http-01') {
      const challengeDir = path.join(process.cwd(), '.well-known', 'acme-challenge');
      await fs.ensureDir(challengeDir);
      await fs.writeFile(path.join(challengeDir, challenge.token), keyAuthorization);
    }
  }

  private async removeChallenge(authz: any, challenge: any): Promise<void> {
    logger.debug('Removing challenge', { 
      domain: authz.identifier.value, 
      type: challenge.type 
    });

    if (challenge.type === 'http-01') {
      const challengePath = path.join(process.cwd(), '.well-known', 'acme-challenge', challenge.token);
      await fs.remove(challengePath).catch(() => {
        // Ignore errors when removing challenge files
      });
    }
  }

  private async saveCertificate(domain: string, cert: string, key: Buffer): Promise<CertificateInfo> {
    const domainDir = path.join(this.certDir, domain);
    await fs.ensureDir(domainDir);

    const certPath = path.join(domainDir, 'cert.pem');
    const keyPath = path.join(domainDir, 'key.pem');

    await fs.writeFile(certPath, cert);
    await fs.writeFile(keyPath, key);

    // Parse certificate to get expiration date
    const certInfo = await this.parseCertificate(cert);

    return {
      domain,
      certPath,
      keyPath,
      expiresAt: certInfo.expiresAt,
      isValid: certInfo.isValid,
    };
  }

  private async parseCertificate(cert: string): Promise<{ expiresAt: Date; isValid: boolean }> {
    try {
      // Use openssl to parse the certificate and get the actual expiration date
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // Write certificate to temporary file for openssl processing
      const tempCertPath = path.join(process.cwd(), 'temp_cert.pem');
      await fs.writeFile(tempCertPath, cert);
      
      try {
        // Use openssl to get certificate expiration date
        const { stdout } = await execAsync(`openssl x509 -in "${tempCertPath}" -noout -enddate`);
        const match = stdout.match(/notAfter=(.+)/);
        
        if (match) {
          const expiresAt = new Date(match[1]);
          const now = new Date();
          const isValid = expiresAt > now;
          
          logger.debug(`Certificate parsed successfully`, {
            expiresAt: expiresAt.toISOString(),
            isValid,
            daysUntilExpiry: Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          });
          
          return { expiresAt, isValid };
        } else {
          throw new Error('Could not parse expiration date from certificate');
        }
      } finally {
        // Clean up temporary file
        await fs.remove(tempCertPath).catch(() => {
          // Ignore cleanup errors
        });
      }
    } catch (error) {
      logger.error('Failed to parse certificate with openssl, falling back to basic validation', error);
      
      // Fallback: basic certificate format validation
      const match = cert.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/);
      if (!match) {
        return {
          expiresAt: new Date(),
          isValid: false,
        };
      }
      
      // If we can't parse the date, assume it's valid for now but log a warning
      logger.warn('Certificate format appears valid but could not parse expiration date');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 90); // Assume 90 days
      
      return {
        expiresAt,
        isValid: true,
      };
    }
  }

  async getCertificateInfo(domain: string): Promise<CertificateInfo | null> {
    const domainDir = path.join(this.certDir, domain);
    const certPath = path.join(domainDir, 'cert.pem');
    const keyPath = path.join(domainDir, 'key.pem');

    try {
      const [certExists, keyExists] = await Promise.all([
        fs.pathExists(certPath),
        fs.pathExists(keyPath),
      ]);

      if (!certExists || !keyExists) return null;

      const cert = await fs.readFile(certPath, 'utf8');
      const certInfo = await this.parseCertificate(cert);

      return {
        domain,
        certPath,
        keyPath,
        expiresAt: certInfo.expiresAt,
        isValid: certInfo.isValid,
      };
    } catch (error) {
      logger.error(`Failed to get certificate info for ${domain}`, error);
      return null;
    }
  }

  async renewCertificate(domain: string): Promise<CertificateInfo> {
    logger.info(`Renewing certificate for domain: ${domain}`);
    return this.obtainCertificate(domain);
  }

  async shouldRenewCertificate(certInfo: CertificateInfo): Promise<boolean> {
    const now = new Date();
    const daysUntilExpiry = Math.floor((certInfo.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    // Renew if less than 30 days until expiry
    return daysUntilExpiry < 30;
  }
} 