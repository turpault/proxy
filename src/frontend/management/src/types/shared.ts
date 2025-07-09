// Re-export shared types from backend
export interface CertificateInfo {
  domain: string;
  certPath: string;
  keyPath: string;
  expiresAt: string; // ISO string format for JSON serialization
  isValid: boolean;
  issuer?: string;
}

// API response type for certificates endpoint
export interface CertificatesResponse {
  [domain: string]: CertificateInfo;
}

// Shared config save request type
export interface ConfigSaveRequest {
  content: string;
  createBackup?: boolean;
  configType?: 'proxy' | 'processes' | 'main';
  path?: string;
} 