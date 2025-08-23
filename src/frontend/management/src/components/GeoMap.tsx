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

// World map coordinates (adjusted for detailed map layout)
const countryCoordinates: { [key: string]: { x: number; y: number; name: string } } = {
  'US': { x: 30, y: 25, name: 'United States' },
  'CN': { x: 75, y: 27, name: 'China' },
  'IN': { x: 68, y: 40, name: 'India' },
  'JP': { x: 85, y: 27, name: 'Japan' },
  'DE': { x: 52, y: 25, name: 'Germany' },
  'GB': { x: 48, y: 25, name: 'United Kingdom' },
  'FR': { x: 50, y: 27, name: 'France' },
  'BR': { x: 28, y: 55, name: 'Brazil' },
  'IT': { x: 54, y: 30, name: 'Italy' },
  'CA': { x: 25, y: 18, name: 'Canada' },
  'AU': { x: 78, y: 72, name: 'Australia' },
  'RU': { x: 70, y: 20, name: 'Russia' },
  'KR': { x: 82, y: 30, name: 'South Korea' },
  'ES': { x: 47, y: 30, name: 'Spain' },
  'MX': { x: 20, y: 35, name: 'Mexico' },
  'ID': { x: 72, y: 50, name: 'Indonesia' },
  'NL': { x: 51, y: 25, name: 'Netherlands' },
  'SA': { x: 58, y: 40, name: 'Saudi Arabia' },
  'TR': { x: 58, y: 30, name: 'Turkey' },
  'CH': { x: 53, y: 28, name: 'Switzerland' },
  'SE': { x: 54, y: 20, name: 'Sweden' },
  'AR': { x: 26, y: 65, name: 'Argentina' },
  'BE': { x: 51, y: 26, name: 'Belgium' },
  'TH': { x: 72, y: 45, name: 'Thailand' },
  'PL': { x: 56, y: 23, name: 'Poland' },
  'AT': { x: 54, y: 28, name: 'Austria' },
  'NO': { x: 53, y: 18, name: 'Norway' },
  'AE': { x: 62, y: 40, name: 'United Arab Emirates' },
  'SG': { x: 75, y: 50, name: 'Singapore' },
  'MY': { x: 73, y: 50, name: 'Malaysia' },
  'DK': { x: 52, y: 22, name: 'Denmark' },
  'FI': { x: 57, y: 18, name: 'Finland' },
  'CL': { x: 22, y: 70, name: 'Chile' },
  'ZA': { x: 52, y: 60, name: 'South Africa' },
  'EG': { x: 58, y: 37, name: 'Egypt' },
  'PH': { x: 80, y: 45, name: 'Philippines' },
  'VN': { x: 74, y: 45, name: 'Vietnam' },
  'CZ': { x: 55, y: 26, name: 'Czech Republic' },
  'RO': { x: 58, y: 30, name: 'Romania' },
  'PT': { x: 46, y: 30, name: 'Portugal' },
  'GR': { x: 56, y: 35, name: 'Greece' },
  'HU': { x: 56, y: 26, name: 'Hungary' },
  'IE': { x: 47, y: 23, name: 'Ireland' },
  'IL': { x: 60, y: 35, name: 'Israel' },
  'NZ': { x: 85, y: 75, name: 'New Zealand' },
  'CO': { x: 24, y: 50, name: 'Colombia' },
  'PE': { x: 22, y: 55, name: 'Peru' },
  'HR': { x: 55, y: 30, name: 'Croatia' },
  'BG': { x: 58, y: 32, name: 'Bulgaria' },
  'SK': { x: 56, y: 27, name: 'Slovakia' },
  'LT': { x: 58, y: 22, name: 'Lithuania' },
  'SI': { x: 55, y: 29, name: 'Slovenia' },
  'LV': { x: 58, y: 20, name: 'Latvia' },
  'EE': { x: 59, y: 20, name: 'Estonia' },
  'CY': { x: 60, y: 35, name: 'Cyprus' },
  'LU': { x: 52, y: 28, name: 'Luxembourg' },
  'MT': { x: 54, y: 35, name: 'Malta' },
  'IS': { x: 50, y: 15, name: 'Iceland' },
  'AD': { x: 50, y: 30, name: 'Andorra' },
  'MC': { x: 52, y: 31, name: 'Monaco' },
  'LI': { x: 53, y: 28, name: 'Liechtenstein' },
  'SM': { x: 54, y: 30, name: 'San Marino' },
  'VA': { x: 54, y: 32, name: 'Vatican City' },
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
          {/* World map outline with detailed coastlines */}
          <g className="world-outline">
            {/* North America */}
            <path
              d="M 15 20 L 18 18 L 22 17 L 26 16 L 30 15 L 34 16 L 38 17 L 42 18 L 45 20 L 47 22 L 48 25 L 47 28 L 45 31 L 42 33 L 38 34 L 34 35 L 30 36 L 26 35 L 22 34 L 18 33 L 15 31 L 13 28 L 12 25 L 13 22 L 15 20 Z M 35 12 L 37 10 L 39 12 L 37 14 L 35 12 Z"
              fill="#f7fafc"
              stroke="#cbd5e0"
              strokeWidth="0.2"
            />
            
            {/* South America */}
            <path
              d="M 25 40 L 27 42 L 29 45 L 30 48 L 31 52 L 31 56 L 30 60 L 29 64 L 27 67 L 25 70 L 23 67 L 22 64 L 21 60 L 20 56 L 20 52 L 21 48 L 22 45 L 23 42 L 25 40 Z"
              fill="#f7fafc"
              stroke="#cbd5e0"
              strokeWidth="0.2"
            />
            
            {/* Europe */}
            <path
              d="M 45 18 L 48 17 L 51 18 L 54 19 L 57 20 L 59 22 L 60 25 L 59 28 L 57 30 L 54 31 L 51 32 L 48 31 L 45 30 L 43 28 L 42 25 L 43 22 L 45 18 Z M 52 15 L 54 13 L 56 15 L 54 17 L 52 15 Z"
              fill="#f7fafc"
              stroke="#cbd5e0"
              strokeWidth="0.2"
            />
            
            {/* Africa */}
            <path
              d="M 48 25 L 50 27 L 52 30 L 54 33 L 55 37 L 56 41 L 56 45 L 55 49 L 54 53 L 52 56 L 50 59 L 48 62 L 46 59 L 45 56 L 44 53 L 43 49 L 42 45 L 42 41 L 43 37 L 44 33 L 45 30 L 46 27 L 48 25 Z"
              fill="#f7fafc"
              stroke="#cbd5e0"
              strokeWidth="0.2"
            />
            
            {/* Asia */}
            <path
              d="M 60 15 L 65 14 L 70 15 L 75 16 L 80 18 L 84 20 L 87 23 L 88 27 L 87 31 L 84 34 L 80 36 L 75 37 L 70 38 L 65 37 L 60 36 L 57 34 L 55 31 L 54 27 L 55 23 L 57 20 L 60 15 Z M 75 12 L 78 10 L 81 12 L 78 14 L 75 12 Z"
              fill="#f7fafc"
              stroke="#cbd5e0"
              strokeWidth="0.2"
            />
            
            {/* Australia */}
            <path
              d="M 75 65 L 78 66 L 81 67 L 83 69 L 84 72 L 83 75 L 81 77 L 78 78 L 75 79 L 72 78 L 70 77 L 68 75 L 67 72 L 68 69 L 70 67 L 72 66 L 75 65 Z"
              fill="#f7fafc"
              stroke="#cbd5e0"
              strokeWidth="0.2"
            />
            
            {/* Greenland */}
            <path
              d="M 35 8 L 37 6 L 39 8 L 40 10 L 39 12 L 37 14 L 35 12 L 34 10 L 35 8 Z"
              fill="#f7fafc"
              stroke="#cbd5e0"
              strokeWidth="0.2"
            />
            
            {/* Antarctica */}
            <path
              d="M 25 85 L 35 86 L 45 87 L 55 88 L 65 89 L 75 88 L 85 87 L 95 86 L 95 90 L 85 91 L 75 92 L 65 93 L 55 92 L 45 91 L 35 90 L 25 89 L 15 90 L 15 86 L 25 85 Z"
              fill="#f7fafc"
              stroke="#cbd5e0"
              strokeWidth="0.2"
            />
            
            {/* Major Islands */}
            <path
              d="M 20 35 L 21 34 L 22 35 L 21 36 L 20 35 Z"
              fill="#f7fafc"
              stroke="#cbd5e0"
              strokeWidth="0.1"
            />
            <path
              d="M 85 45 L 86 44 L 87 45 L 86 46 L 85 45 Z"
              fill="#f7fafc"
              stroke="#cbd5e0"
              strokeWidth="0.1"
            />
            <path
              d="M 70 55 L 71 54 L 72 55 L 71 56 L 70 55 Z"
              fill="#f7fafc"
              stroke="#cbd5e0"
              strokeWidth="0.1"
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