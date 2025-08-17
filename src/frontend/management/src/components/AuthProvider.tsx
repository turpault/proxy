import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { API_BASE } from '../utils/api-client';
import { SessionValidationResponse } from '../types';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  session: any | null;
  login: () => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<any | null>(null);

  const checkAuth = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/session`, {
        method: 'GET',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json() as SessionValidationResponse;
        
        if (data.success && data.authenticated && data.session) {
          setIsAuthenticated(true);
          setSession(data.session);
        } else {
          setIsAuthenticated(false);
          setSession(null);
        }
      } else {
        setIsAuthenticated(false);
        setSession(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setIsAuthenticated(false);
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = () => {
    setIsAuthenticated(true);
    checkAuth(); // Refresh session data
  };

  const logout = async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsAuthenticated(false);
      setSession(null);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const value: AuthContextType = {
    isAuthenticated,
    isLoading,
    session,
    login,
    logout,
    checkAuth,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
