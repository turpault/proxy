import React, { useState, useEffect } from 'react';
import { useNotifications } from '../NotificationProvider';
import { formatLocalTime } from '../../utils';

export const CertificatesTab: React.FC = () => {
  const [certificates, setCertificates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { showNotification } = useNotifications();

  useEffect(() => {
    loadCertificates();
  }, []);

  const loadCertificates = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/certificates');
      if (response.ok) {
        const data = await response.json();
        // Convert object to array format for compatibility
        const certificatesArray = Object.values(data);
        setCertificates(certificatesArray);
      } else {
        throw new Error('Failed to load certificates');
      }
    } catch (error) {
      console.error('Failed to load certificates:', error);
      showNotification('Failed to load certificates', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadCertificates();
    showNotification('Refreshing certificates...', 'info');
  };

  if (loading) {
    return (
      <div className="certificates-tab">
        <div className="loading">Loading certificates...</div>
      </div>
    );
  }

  return (
    <div className="certificates-tab">
      <div className="certificates-header">
        <h2>SSL Certificates</h2>
        <button className="btn btn-refresh" onClick={handleRefresh}>
          Refresh
        </button>
      </div>

      <div className="certificates-container">
        {certificates.length === 0 ? (
          <div className="no-certificates">
            <p>No certificates found</p>
          </div>
        ) : (
          <div className="certificates-grid">
            {certificates.map((cert, index) => (
              <div key={index} className="certificate-card">
                <div className="cert-header">
                  <h3>{cert.domain || 'Unknown Domain'}</h3>
                  <span className={`cert-status ${cert.isValid ? 'valid' : 'invalid'}`}>
                    {cert.isValid ? 'Valid' : 'Invalid'}
                  </span>
                </div>
                <div className="cert-info">
                  <div className="info-row">
                    <span className="label">Issuer:</span>
                    <span className="value">{cert.issuer || 'N/A'}</span>
                  </div>
                  <div className="info-row">
                    <span className="label">Valid From:</span>
                    <span className="value">{formatLocalTime(cert.validFrom)}</span>
                  </div>
                  <div className="info-row">
                    <span className="label">Valid Until:</span>
                    <span className="value">{formatLocalTime(cert.expiresAt)}</span>
                  </div>
                  <div className="info-row">
                    <span className="label">Days Remaining:</span>
                    <span className="value">{cert.daysRemaining || 'N/A'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}; 