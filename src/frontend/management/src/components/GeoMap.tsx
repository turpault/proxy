import React, { useMemo, useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default markers in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface CountryData {
  country: string;
  count: number;
  percentage: number;
  city?: string;
}

interface CityData {
  city: string;
  country: string;
  count: number;
  percentage: number;
}

interface IPData {
  ip: string;
  country: string;
  city: string;
  count: number;
  percentage: number;
}

interface GeoMapProps {
  countryData: CountryData[];
  cityData?: CityData[];
  ipData?: IPData[];
  title?: string;
  height?: number;
}

// Country code to country name mapping
const countryCodeMap: { [key: string]: string } = {
  'US': 'United States',
  'CN': 'China',
  'IN': 'India',
  'JP': 'Japan',
  'DE': 'Germany',
  'GB': 'United Kingdom',
  'FR': 'France',
  'BR': 'Brazil',
  'IT': 'Italy',
  'CA': 'Canada',
  'AU': 'Australia',
  'RU': 'Russia',
  'KR': 'South Korea',
  'ES': 'Spain',
  'MX': 'Mexico',
  'ID': 'Indonesia',
  'NL': 'Netherlands',
  'SA': 'Saudi Arabia',
  'TR': 'Turkey',
  'CH': 'Switzerland',
  'SE': 'Sweden',
  'AR': 'Argentina',
  'BE': 'Belgium',
  'TH': 'Thailand',
  'PL': 'Poland',
  'AT': 'Austria',
  'NO': 'Norway',
  'AE': 'United Arab Emirates',
  'SG': 'Singapore',
  'MY': 'Malaysia',
  'DK': 'Denmark',
  'FI': 'Finland',
  'CL': 'Chile',
  'ZA': 'South Africa',
  'EG': 'Egypt',
  'PH': 'Philippines',
  'VN': 'Vietnam',
  'CZ': 'Czech Republic',
  'RO': 'Romania',
  'PT': 'Portugal',
  'GR': 'Greece',
  'HU': 'Hungary',
  'IE': 'Ireland',
  'IL': 'Israel',
  'NZ': 'New Zealand',
  'CO': 'Colombia',
  'PE': 'Peru',
  'HR': 'Croatia',
  'BG': 'Bulgaria',
  'SK': 'Slovakia',
  'LT': 'Lithuania',
  'SI': 'Slovenia',
  'LV': 'Latvia',
  'EE': 'Estonia',
  'CY': 'Cyprus',
  'LU': 'Luxembourg',
  'MT': 'Malta',
  'IS': 'Iceland',
  'AD': 'Andorra',
  'MC': 'Monaco',
  'LI': 'Liechtenstein',
  'SM': 'San Marino',
  'VA': 'Vatican City',
  'Unknown': 'Unknown'
};

// Country coordinates for Leaflet (latitude, longitude)
const countryCoordinates: { [key: string]: { lat: number; lng: number; name: string } } = {
  'US': { lat: 39.8283, lng: -98.5795, name: 'United States' },
  'CN': { lat: 35.8617, lng: 104.1954, name: 'China' },
  'IN': { lat: 20.5937, lng: 78.9629, name: 'India' },
  'JP': { lat: 36.2048, lng: 138.2529, name: 'Japan' },
  'DE': { lat: 51.1657, lng: 10.4515, name: 'Germany' },
  'GB': { lat: 55.3781, lng: -3.4360, name: 'United Kingdom' },
  'FR': { lat: 46.2276, lng: 2.2137, name: 'France' },
  'BR': { lat: -14.2350, lng: -51.9253, name: 'Brazil' },
  'IT': { lat: 41.8719, lng: 12.5674, name: 'Italy' },
  'CA': { lat: 56.1304, lng: -106.3468, name: 'Canada' },
  'AU': { lat: -25.2744, lng: 133.7751, name: 'Australia' },
  'RU': { lat: 61.5240, lng: 105.3188, name: 'Russia' },
  'KR': { lat: 35.9078, lng: 127.7669, name: 'South Korea' },
  'ES': { lat: 40.4637, lng: -3.7492, name: 'Spain' },
  'MX': { lat: 23.6345, lng: -102.5528, name: 'Mexico' },
  'ID': { lat: -0.7893, lng: 113.9213, name: 'Indonesia' },
  'NL': { lat: 52.1326, lng: 5.2913, name: 'Netherlands' },
  'SA': { lat: 23.8859, lng: 45.0792, name: 'Saudi Arabia' },
  'TR': { lat: 38.9637, lng: 35.2433, name: 'Turkey' },
  'CH': { lat: 46.8182, lng: 8.2275, name: 'Switzerland' },
  'SE': { lat: 60.1282, lng: 18.6435, name: 'Sweden' },
  'AR': { lat: -38.4161, lng: -63.6167, name: 'Argentina' },
  'BE': { lat: 50.8503, lng: 4.3517, name: 'Belgium' },
  'TH': { lat: 15.8700, lng: 100.9925, name: 'Thailand' },
  'PL': { lat: 51.9194, lng: 19.1451, name: 'Poland' },
  'AT': { lat: 47.5162, lng: 14.5501, name: 'Austria' },
  'NO': { lat: 60.4720, lng: 8.4689, name: 'Norway' },
  'AE': { lat: 23.4241, lng: 53.8478, name: 'United Arab Emirates' },
  'SG': { lat: 1.3521, lng: 103.8198, name: 'Singapore' },
  'MY': { lat: 4.2105, lng: 108.9758, name: 'Malaysia' },
  'DK': { lat: 56.2639, lng: 9.5018, name: 'Denmark' },
  'FI': { lat: 61.9241, lng: 25.7482, name: 'Finland' },
  'CL': { lat: -35.6751, lng: -71.5430, name: 'Chile' },
  'ZA': { lat: -30.5595, lng: 22.9375, name: 'South Africa' },
  'EG': { lat: 26.8206, lng: 30.8025, name: 'Egypt' },
  'PH': { lat: 12.8797, lng: 121.7740, name: 'Philippines' },
  'VN': { lat: 14.0583, lng: 108.2772, name: 'Vietnam' },
  'CZ': { lat: 49.8175, lng: 15.4730, name: 'Czech Republic' },
  'RO': { lat: 45.9432, lng: 24.9668, name: 'Romania' },
  'PT': { lat: 39.3999, lng: -8.2245, name: 'Portugal' },
  'GR': { lat: 39.0742, lng: 21.8243, name: 'Greece' },
  'HU': { lat: 47.1625, lng: 19.5033, name: 'Hungary' },
  'IE': { lat: 53.1424, lng: -7.6921, name: 'Ireland' },
  'IL': { lat: 31.0461, lng: 34.8516, name: 'Israel' },
  'NZ': { lat: -40.9006, lng: 174.8860, name: 'New Zealand' },
  'CO': { lat: 4.5709, lng: -74.2973, name: 'Colombia' },
  'PE': { lat: -9.1900, lng: -75.0152, name: 'Peru' },
  'HR': { lat: 45.1000, lng: 15.2000, name: 'Croatia' },
  'BG': { lat: 42.7339, lng: 25.4858, name: 'Bulgaria' },
  'SK': { lat: 48.6690, lng: 19.6990, name: 'Slovakia' },
  'LT': { lat: 55.1694, lng: 23.8813, name: 'Lithuania' },
  'SI': { lat: 46.0569, lng: 14.5058, name: 'Slovenia' },
  'LV': { lat: 56.8796, lng: 24.6032, name: 'Latvia' },
  'EE': { lat: 58.5953, lng: 25.0136, name: 'Estonia' },
  'CY': { lat: 35.1264, lng: 33.4299, name: 'Cyprus' },
  'LU': { lat: 49.8153, lng: 6.1296, name: 'Luxembourg' },
  'MT': { lat: 35.9375, lng: 14.3754, name: 'Malta' },
  'IS': { lat: 64.9631, lng: -19.0208, name: 'Iceland' },
  'AD': { lat: 42.5063, lng: 1.5218, name: 'Andorra' },
  'MC': { lat: 43.7384, lng: 7.4246, name: 'Monaco' },
  'LI': { lat: 47.1660, lng: 9.5554, name: 'Liechtenstein' },
  'SM': { lat: 43.9424, lng: 12.4578, name: 'San Marino' },
  'VA': { lat: 41.9029, lng: 12.4534, name: 'Vatican City' },
  'Unknown': { lat: 0, lng: 0, name: 'Unknown' }
};

export const GeoMap: React.FC<GeoMapProps> = ({
  countryData,
  cityData = [],
  ipData = [],
  title = 'Request Distribution by Country',
  height = 400
}) => {
  const [viewMode, setViewMode] = useState<'country' | 'city' | 'ip'>('country');

  const processedData = useMemo(() => {
    let data;
    if (viewMode === 'country') {
      data = countryData;
    } else if (viewMode === 'city') {
      data = cityData;
    } else {
      data = ipData;
    }
    
    const maxCount = Math.max(...data.map(d => d.count), 1);

    return data.map(item => {
      if (viewMode === 'country') {
        const countryCode = Object.keys(countryCodeMap).find(
          code => countryCodeMap[code] === item.country
        ) || 'Unknown';

        const coords = countryCoordinates[countryCode];
        if (!coords) return null;

        const intensity = Math.max(0.1, item.count / maxCount);
        const radius = Math.max(4, Math.min(20, 4 + (intensity * 16)));

        return {
          ...item,
          countryCode,
          lat: coords.lat,
          lng: coords.lng,
          intensity,
          radius,
          displayName: coords.name,
          type: 'country'
        };
      } else if (viewMode === 'city') {
        // For cities, we need to find the country coordinates and add some offset
        const countryCode = Object.keys(countryCodeMap).find(
          code => countryCodeMap[code] === item.country
        ) || 'Unknown';

        const coords = countryCoordinates[countryCode];
        if (!coords) return null;

        // Add some random offset for cities within the same country
        const offsetLat = (Math.random() - 0.5) * 2;
        const offsetLng = (Math.random() - 0.5) * 2;

        const intensity = Math.max(0.1, item.count / maxCount);
        const radius = Math.max(3, Math.min(16, 3 + (intensity * 13)));

        return {
          ...item,
          countryCode,
          lat: coords.lat + offsetLat,
          lng: coords.lng + offsetLng,
          intensity,
          radius,
          displayName: `${item.city}, ${item.country}`,
          type: 'city'
        };
      } else {
        // For IPs, we need to find the country coordinates and add some offset
        const ipItem = item as IPData;
        const countryCode = Object.keys(countryCodeMap).find(
          code => countryCodeMap[code] === ipItem.country
        ) || 'Unknown';

        const coords = countryCoordinates[countryCode];
        if (!coords) return null;

        // Add some random offset for IPs within the same country
        const offsetLat = (Math.random() - 0.5) * 1.5;
        const offsetLng = (Math.random() - 0.5) * 1.5;

        const intensity = Math.max(0.1, ipItem.count / maxCount);
        const radius = Math.max(2, Math.min(12, 2 + (intensity * 10)));

        return {
          ...ipItem,
          countryCode,
          lat: coords.lat + offsetLat,
          lng: coords.lng + offsetLng,
          intensity,
          radius,
          displayName: `${ipItem.ip} (${ipItem.city}, ${ipItem.country})`,
          type: 'ip'
        };
      }
    }).filter((data): data is NonNullable<typeof data> => data !== null);
  }, [countryData, cityData, ipData, viewMode]);

  const totalRequests = (() => {
    if (viewMode === 'country') return countryData.reduce((sum, d) => sum + d.count, 0);
    if (viewMode === 'city') return cityData.reduce((sum, d) => sum + d.count, 0);
    return ipData.reduce((sum, d) => sum + d.count, 0);
  })();

  return (
    <div className="geo-map-container">
      <div className="geo-map-header">
        <h3>{title}</h3>
        <div className="geo-map-controls">
          {(cityData.length > 0 || ipData.length > 0) && (
            <div className="view-mode-toggle">
              <button
                className={`toggle-btn ${viewMode === 'country' ? 'active' : ''}`}
                onClick={() => setViewMode('country')}
              >
                Countries
              </button>
              {cityData.length > 0 && (
                <button
                  className={`toggle-btn ${viewMode === 'city' ? 'active' : ''}`}
                  onClick={() => setViewMode('city')}
                >
                  Cities
                </button>
              )}
              {ipData.length > 0 && (
                <button
                  className={`toggle-btn ${viewMode === 'ip' ? 'active' : ''}`}
                  onClick={() => setViewMode('ip')}
                >
                  IPs
                </button>
              )}
            </div>
          )}
          <div className="geo-map-stats">
            <span>Total Requests: {totalRequests.toLocaleString()}</span>
            <span>
              {viewMode === 'country' ? 'Countries' : viewMode === 'city' ? 'Cities' : 'IPs'}: {
                viewMode === 'country' ? countryData.length : 
                viewMode === 'city' ? cityData.length : 
                ipData.length
              }
            </span>
          </div>
        </div>
      </div>

      <div className="geo-map-wrapper" style={{ height }}>
        <MapContainer
          center={[20, 0]}
          zoom={2}
          style={{ width: '100%', height: '100%' }}
          className="leaflet-map"
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          
          {/* Country/City markers */}
          {processedData.map((data, index) => (
            <CircleMarker
              key={`${data.countryCode}-${index}`}
              center={[data.lat, data.lng]}
              radius={data.radius}
              fillColor={`rgba(66, 153, 225, ${data.intensity})`}
              color="#3182ce"
              weight={1}
              opacity={0.8}
              fillOpacity={data.intensity}
            >
              <Popup>
                <div>
                  <strong>{data.displayName}</strong><br />
                  Requests: {data.count.toLocaleString()}<br />
                  Percentage: {data.percentage.toFixed(1)}%
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {/* Legend */}
      <div className="geo-map-legend">
        <div className="legend-title">Request Volume</div>
        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-circle small"></div>
            <span>Low</span>
          </div>
          <div className="legend-item">
            <div className="legend-circle medium"></div>
            <span>Medium</span>
          </div>
          <div className="legend-item">
            <div className="legend-circle large"></div>
            <span>High</span>
          </div>
        </div>
      </div>

      {/* Top locations list */}
      <div className="geo-map-countries">
        <h4>Top {viewMode === 'country' ? 'Countries' : viewMode === 'city' ? 'Cities' : 'IPs'}</h4>
        <div className="countries-list">
          {processedData
            .sort((a, b) => b.count - a.count)
            .slice(0, 10)
            .map((data, index) => (
              <div key={index} className="country-item">
                <span className="country-name">{data.displayName}</span>
                <span className="country-count">{data.count.toLocaleString()}</span>
                <span className="country-percentage">({data.percentage.toFixed(1)}%)</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}; 