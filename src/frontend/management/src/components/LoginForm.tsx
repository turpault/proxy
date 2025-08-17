import React, { useState } from 'react';
import { API_BASE } from '../utils/api-client';
import { LoginRequest, LoginResponse } from '../types';

interface LoginFormProps {
  onLoginSuccess: () => void;
  onLoginError: (error: string) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess, onLoginError }) => {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password.trim()) {
      setError('Please enter a password');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ password } as LoginRequest),
      });

      const data = await response.json() as LoginResponse;

      if (data.success && data.session) {
        onLoginSuccess();
      } else {
        const errorMessage = data.error || 'Login failed';
        setError(errorMessage);
        onLoginError(errorMessage);
      }
    } catch (error) {
      const errorMessage = 'Network error. Please try again.';
      setError(errorMessage);
      onLoginError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Proxy Server Management</h1>
          <p>Please enter the admin password to continue</p>
        </div>
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="password">Admin Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
              disabled={isLoading}
              autoFocus
            />
          </div>
          
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
          
          <button
            type="submit"
            className="login-button"
            disabled={isLoading || !password.trim()}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};
