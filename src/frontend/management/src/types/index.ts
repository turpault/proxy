// Core types for the management console
// Import all shared types
export * from './shared';

// Re-export shared types from backend (all types are now in shared.ts)
export * from '../../../../types/shared';

// Frontend-specific types that extend or modify shared types
import { ConfigSaveRequest } from './shared';
export interface SaveConfigRequest extends ConfigSaveRequest { } 