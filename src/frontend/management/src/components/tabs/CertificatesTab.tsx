import React, { useState, useEffect } from 'react';
import { useNotifications } from '../NotificationProvider';
import { formatLocalTime, formatDateOnly } from '../../utils';
import { CertificateInfo, CertificatesResponse } from '../../types/shared';
import { certificatesApi, handleApiResponse } from '../../utils/api-client';

export const CertificatesTab: React.FC = () => {
  const [certificates, setCertificates] = useState<CertificateInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const { showNotification } = useNotifications();

  useEffect(() => {
    loadCertificates();
  }, []);

  const loadCertificates = async () => {
    try {
      setLoading(true);
      const data = await handleApiResponse(certificatesApi.getCertificates());
      // Convert object to array format for compatibility
      const certificatesArray = Object.values(data) as CertificateInfo[];
      setCertificates(certificatesArray);
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
                    <span className="label">Valid Until:</span>
                    <span className="value">{formatDateOnly(cert.expiresAt)}</span>
                  </div>
                  <div className="info-row">
                    <span className="label">Days Remaining:</span>
                    <span className="value">{(() => {
                      const now = new Date();
                      const expiry = new Date(cert.expiresAt);
                      const daysRemaining = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                      return daysRemaining > 0 ? daysRemaining.toString() : 'Expired';
                    })()}</span>
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