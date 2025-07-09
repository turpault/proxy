// Core types for the management console
// Import all shared types
export * from './shared';

// Frontend-specific types that extend or modify shared types
import { ConfigSaveRequest } from './shared';
export interface SaveConfigRequest extends ConfigSaveRequest { } 