import { SessionManager } from '../services/session-manager';
import { ProxyRoute } from '../types';
import { logger } from './logger';

/**
 * Get the appropriate SessionManager instance for a route
 * @param route The proxy route configuration
 * @param domain The domain name (optional, defaults to route domain)
 * @returns SessionManager instance
 */
export function getSessionManagerForRoute(route: ProxyRoute, domain?: string): SessionManager {
  // If a specific session domain is configured in OAuth2 config, use that
  if (route.oauth2?.sessionDomain) {
    logger.debug(`Using configured session domain: ${route.oauth2.sessionDomain} for route ${route.name || route.domain}`);
    return SessionManager.getInstance(route.oauth2.sessionDomain);
  }

  // Otherwise use the route domain name
  const sessionDomain = domain || route.domain;
  logger.debug(`Using route domain as session domain: ${sessionDomain} for route ${route.name || route.domain}`);
  return SessionManager.getInstance(sessionDomain);
}

/**
 * Get the management console SessionManager instance
 * @returns SessionManager instance for management console
 */
export function getManagementSessionManager(): SessionManager {
  return SessionManager.getManagementInstance();
}

/**
 * Get all active SessionManager instances
 * @returns Map of domain to SessionManager instance
 */
export function getAllSessionManagers(): Map<string, SessionManager> {
  // This would require exposing the instances map from SessionManager
  // For now, we'll return a map with the management instance
  const managers = new Map<string, SessionManager>();
  managers.set('_management_', SessionManager.getManagementInstance());
  return managers;
}
