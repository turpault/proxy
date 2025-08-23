import React, { useMemo, useState } from 'react';

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

interface GeoMapProps {
  countryData: CountryData[];
  cityData?: CityData[];
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

// World map coordinates (adjusted for better map layout)
const countryCoordinates: { [key: string]: { x: number; y: number; name: string } } = {
  'US': { x: 25, y: 32, name: 'United States' },
  'CN': { x: 75, y: 35, name: 'China' },
  'IN': { x: 68, y: 45, name: 'India' },
  'JP': { x: 85, y: 35, name: 'Japan' },
  'DE': { x: 52, y: 30, name: 'Germany' },
  'GB': { x: 48, y: 30, name: 'United Kingdom' },
  'FR': { x: 50, y: 32, name: 'France' },
  'BR': { x: 28, y: 60, name: 'Brazil' },
  'IT': { x: 54, y: 35, name: 'Italy' },
  'CA': { x: 22, y: 22, name: 'Canada' },
  'AU': { x: 78, y: 72, name: 'Australia' },
  'RU': { x: 70, y: 25, name: 'Russia' },
  'KR': { x: 82, y: 38, name: 'South Korea' },
  'ES': { x: 47, y: 35, name: 'Spain' },
  'MX': { x: 18, y: 42, name: 'Mexico' },
  'ID': { x: 72, y: 55, name: 'Indonesia' },
  'NL': { x: 51, y: 30, name: 'Netherlands' },
  'SA': { x: 58, y: 45, name: 'Saudi Arabia' },
  'TR': { x: 58, y: 35, name: 'Turkey' },
  'CH': { x: 53, y: 32, name: 'Switzerland' },
  'SE': { x: 54, y: 25, name: 'Sweden' },
  'AR': { x: 26, y: 68, name: 'Argentina' },
  'BE': { x: 51, y: 31, name: 'Belgium' },
  'TH': { x: 72, y: 48, name: 'Thailand' },
  'PL': { x: 56, y: 28, name: 'Poland' },
  'AT': { x: 54, y: 32, name: 'Austria' },
  'NO': { x: 53, y: 22, name: 'Norway' },
  'AE': { x: 62, y: 45, name: 'United Arab Emirates' },
  'SG': { x: 75, y: 52, name: 'Singapore' },
  'MY': { x: 73, y: 52, name: 'Malaysia' },
  'DK': { x: 52, y: 26, name: 'Denmark' },
  'FI': { x: 57, y: 22, name: 'Finland' },
  'CL': { x: 22, y: 72, name: 'Chile' },
  'ZA': { x: 52, y: 65, name: 'South Africa' },
  'EG': { x: 58, y: 42, name: 'Egypt' },
  'PH': { x: 80, y: 48, name: 'Philippines' },
  'VN': { x: 74, y: 48, name: 'Vietnam' },
  'CZ': { x: 55, y: 30, name: 'Czech Republic' },
  'RO': { x: 58, y: 33, name: 'Romania' },
  'PT': { x: 46, y: 35, name: 'Portugal' },
  'GR': { x: 56, y: 38, name: 'Greece' },
  'HU': { x: 56, y: 30, name: 'Hungary' },
  'IE': { x: 47, y: 28, name: 'Ireland' },
  'IL': { x: 60, y: 40, name: 'Israel' },
  'NZ': { x: 85, y: 78, name: 'New Zealand' },
  'CO': { x: 24, y: 55, name: 'Colombia' },
  'PE': { x: 22, y: 60, name: 'Peru' },
  'HR': { x: 55, y: 34, name: 'Croatia' },
  'BG': { x: 58, y: 35, name: 'Bulgaria' },
  'SK': { x: 56, y: 31, name: 'Slovakia' },
  'LT': { x: 58, y: 26, name: 'Lithuania' },
  'SI': { x: 55, y: 33, name: 'Slovenia' },
  'LV': { x: 58, y: 24, name: 'Latvia' },
  'EE': { x: 59, y: 24, name: 'Estonia' },
  'CY': { x: 60, y: 40, name: 'Cyprus' },
  'LU': { x: 52, y: 32, name: 'Luxembourg' },
  'MT': { x: 54, y: 40, name: 'Malta' },
  'IS': { x: 50, y: 18, name: 'Iceland' },
  'AD': { x: 50, y: 35, name: 'Andorra' },
  'MC': { x: 52, y: 36, name: 'Monaco' },
  'LI': { x: 53, y: 32, name: 'Liechtenstein' },
  'SM': { x: 54, y: 35, name: 'San Marino' },
  'VA': { x: 54, y: 37, name: 'Vatican City' },
  'Unknown': { x: 50, y: 50, name: 'Unknown' }
};

export const GeoMap: React.FC<GeoMapProps> = ({
  countryData,
  cityData = [],
  title = 'Request Distribution by Country',
  height = 400
}) => {
  const [viewMode, setViewMode] = useState<'country' | 'city'>('country');

  const processedData = useMemo(() => {
    const data = viewMode === 'country' ? countryData : cityData;
    const maxCount = Math.max(...data.map(d => d.count), 1);

    return data.map(item => {
      if (viewMode === 'country') {
        const countryCode = Object.keys(countryCodeMap).find(
          code => countryCodeMap[code] === item.country
        ) || 'Unknown';

        const coords = countryCoordinates[countryCode];
        if (!coords) return null;

        const intensity = Math.max(0.1, item.count / maxCount);
        const size = Math.max(4, Math.min(20, 4 + (intensity * 16)));

        return {
          ...item,
          countryCode,
          x: coords.x,
          y: coords.y,
          intensity,
          size,
          displayName: coords.name,
          type: 'country'
        };
      } else {
        // For cities, we need to find the country coordinates and add some offset
        const countryCode = Object.keys(countryCodeMap).find(
          code => countryCodeMap[code] === item.country
        ) || 'Unknown';

        const coords = countryCoordinates[countryCode];
        if (!coords) return null;

        // Add some random offset for cities within the same country
        const offsetX = (Math.random() - 0.5) * 4;
        const offsetY = (Math.random() - 0.5) * 4;

        const intensity = Math.max(0.1, item.count / maxCount);
        const size = Math.max(3, Math.min(16, 3 + (intensity * 13)));

        return {
          ...item,
          countryCode,
          x: coords.x + offsetX,
          y: coords.y + offsetY,
          intensity,
          size,
          displayName: `${item.city}, ${item.country}`,
          type: 'city'
        };
      }
    }).filter((data): data is NonNullable<typeof data> => data !== null);
  }, [countryData, cityData, viewMode]);

  const totalRequests = (viewMode === 'country' ? countryData : cityData).reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="geo-map-container">
      <div className="geo-map-header">
        <h3>{title}</h3>
        <div className="geo-map-controls">
          {cityData.length > 0 && (
            <div className="view-mode-toggle">
              <button
                className={`toggle-btn ${viewMode === 'country' ? 'active' : ''}`}
                onClick={() => setViewMode('country')}
              >
                Countries
              </button>
              <button
                className={`toggle-btn ${viewMode === 'city' ? 'active' : ''}`}
                onClick={() => setViewMode('city')}
              >
                Cities
              </button>
            </div>
          )}
          <div className="geo-map-stats">
            <span>Total Requests: {totalRequests.toLocaleString()}</span>
            <span>{viewMode === 'country' ? 'Countries' : 'Cities'}: {(viewMode === 'country' ? countryData : cityData).length}</span>
          </div>
        </div>
      </div>

      <div className="geo-map-wrapper" style={{ height }}>
        <svg
          viewBox="0 0 100 100"
          className="geo-map-svg"
          style={{ width: '100%', height: '100%' }}
        >
          {/* World map outline (more realistic) */}
          <g className="world-outline">
            {/* North America */}
            <path
              d="M 12 25 Q 15 20 20 22 L 25 20 Q 30 18 35 22 L 38 25 Q 40 30 38 35 L 35 40 Q 30 42 25 40 L 20 38 Q 15 35 12 30 Z"
              fill="#f7fafc"
              stroke="#cbd5e0"
              strokeWidth="0.3"
            />
            {/* South America */}
            <path
              d="M 25 45 Q 28 48 30 50 L 32 55 Q 33 60 32 65 L 30 70 Q 28 75 25 78 L 22 75 Q 20 70 22 65 L 23 60 Q 24 55 25 50 Z"
              fill="#f7fafc"
              stroke="#cbd5e0"
              strokeWidth="0.3"
            />
            {/* Europe */}
            <path
              d="M 45 25 Q 50 22 55 25 L 58 28 Q 60 32 58 35 L 55 38 Q 50 40 45 38 L 42 35 Q 40 32 42 28 Z"
              fill="#f7fafc"
              stroke="#cbd5e0"
              strokeWidth="0.3"
            />
            {/* Africa */}
            <path
              d="M 48 35 Q 52 38 55 40 L 58 45 Q 60 50 58 55 L 55 60 Q 52 65 48 68 L 45 65 Q 43 60 45 55 L 46 50 Q 47 45 48 40 Z"
              fill="#f7fafc"
              stroke="#cbd5e0"
              strokeWidth="0.3"
            />
            {/* Asia */}
            <path
              d="M 60 20 Q 70 18 80 22 L 85 25 Q 88 30 85 35 L 80 40 Q 70 45 60 42 L 55 38 Q 52 35 55 30 Z"
              fill="#f7fafc"
              stroke="#cbd5e0"
              strokeWidth="0.3"
            />
            {/* Australia */}
            <path
              d="M 70 65 Q 75 68 80 70 L 82 72 Q 83 75 82 78 L 80 80 Q 75 82 70 80 L 68 78 Q 67 75 68 72 Z"
              fill="#f7fafc"
              stroke="#cbd5e0"
              strokeWidth="0.3"
            />
            {/* Greenland */}
            <path
              d="M 35 15 Q 38 12 40 15 L 42 18 Q 43 20 42 22 L 40 25 Q 38 28 35 25 L 33 22 Q 32 20 33 18 Z"
              fill="#f7fafc"
              stroke="#cbd5e0"
              strokeWidth="0.3"
            />
            {/* Antarctica */}
            <path
              d="M 30 85 Q 50 88 70 85 L 75 87 Q 80 90 75 92 L 70 95 Q 50 98 30 95 L 25 92 Q 20 90 25 87 Z"
              fill="#f7fafc"
              stroke="#cbd5e0"
              strokeWidth="0.3"
            />
          </g>

          {/* Country markers */}
          {processedData.map((data, index) => (
            <g key={`${data.countryCode}-${index}`} className="country-marker">
              <circle
                cx={data.x}
                cy={data.y}
                r={data.size}
                fill={`rgba(66, 153, 225, ${data.intensity})`}
                stroke="#3182ce"
                strokeWidth="0.5"
                className="marker-circle"
              />
              <text
                x={data.x}
                y={data.y + data.size + 2}
                textAnchor="middle"
                fontSize="2"
                fill="#4a5568"
                className="marker-label"
              >
                {data.count}
              </text>
            </g>
          ))}
        </svg>
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
        <h4>Top {viewMode === 'country' ? 'Countries' : 'Cities'}</h4>
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