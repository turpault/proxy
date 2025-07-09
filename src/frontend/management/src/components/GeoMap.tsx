import React, { useMemo } from 'react';

interface CountryData {
  country: string;
  count: number;
  percentage: number;
  city?: string;
}

interface GeoMapProps {
  countryData: CountryData[];
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

// Simplified world map coordinates (major countries)
const countryCoordinates: { [key: string]: { x: number; y: number; name: string } } = {
  'US': { x: 15, y: 40, name: 'United States' },
  'CN': { x: 75, y: 45, name: 'China' },
  'IN': { x: 65, y: 55, name: 'India' },
  'JP': { x: 85, y: 45, name: 'Japan' },
  'DE': { x: 50, y: 35, name: 'Germany' },
  'GB': { x: 48, y: 35, name: 'United Kingdom' },
  'FR': { x: 48, y: 38, name: 'France' },
  'BR': { x: 30, y: 65, name: 'Brazil' },
  'IT': { x: 52, y: 40, name: 'Italy' },
  'CA': { x: 18, y: 30, name: 'Canada' },
  'AU': { x: 80, y: 75, name: 'Australia' },
  'RU': { x: 65, y: 25, name: 'Russia' },
  'KR': { x: 82, y: 45, name: 'South Korea' },
  'ES': { x: 47, y: 42, name: 'Spain' },
  'MX': { x: 20, y: 50, name: 'Mexico' },
  'ID': { x: 72, y: 60, name: 'Indonesia' },
  'NL': { x: 49, y: 35, name: 'Netherlands' },
  'SA': { x: 55, y: 50, name: 'Saudi Arabia' },
  'TR': { x: 55, y: 40, name: 'Turkey' },
  'CH': { x: 51, y: 38, name: 'Switzerland' },
  'SE': { x: 52, y: 28, name: 'Sweden' },
  'AR': { x: 28, y: 70, name: 'Argentina' },
  'BE': { x: 49, y: 36, name: 'Belgium' },
  'TH': { x: 70, y: 55, name: 'Thailand' },
  'PL': { x: 54, y: 32, name: 'Poland' },
  'AT': { x: 52, y: 37, name: 'Austria' },
  'NO': { x: 51, y: 25, name: 'Norway' },
  'AE': { x: 58, y: 50, name: 'United Arab Emirates' },
  'SG': { x: 75, y: 58, name: 'Singapore' },
  'MY': { x: 73, y: 58, name: 'Malaysia' },
  'DK': { x: 51, y: 30, name: 'Denmark' },
  'FI': { x: 55, y: 25, name: 'Finland' },
  'CL': { x: 25, y: 75, name: 'Chile' },
  'ZA': { x: 52, y: 75, name: 'South Africa' },
  'EG': { x: 55, y: 48, name: 'Egypt' },
  'PH': { x: 78, y: 55, name: 'Philippines' },
  'VN': { x: 74, y: 55, name: 'Vietnam' },
  'CZ': { x: 53, y: 35, name: 'Czech Republic' },
  'RO': { x: 56, y: 38, name: 'Romania' },
  'PT': { x: 46, y: 42, name: 'Portugal' },
  'GR': { x: 54, y: 42, name: 'Greece' },
  'HU': { x: 54, y: 37, name: 'Hungary' },
  'IE': { x: 47, y: 33, name: 'Ireland' },
  'IL': { x: 57, y: 45, name: 'Israel' },
  'NZ': { x: 85, y: 80, name: 'New Zealand' },
  'CO': { x: 26, y: 60, name: 'Colombia' },
  'PE': { x: 24, y: 65, name: 'Peru' },
  'HR': { x: 53, y: 39, name: 'Croatia' },
  'BG': { x: 56, y: 40, name: 'Bulgaria' },
  'SK': { x: 54, y: 36, name: 'Slovakia' },
  'LT': { x: 56, y: 30, name: 'Lithuania' },
  'SI': { x: 53, y: 38, name: 'Slovenia' },
  'LV': { x: 56, y: 28, name: 'Latvia' },
  'EE': { x: 57, y: 28, name: 'Estonia' },
  'CY': { x: 58, y: 45, name: 'Cyprus' },
  'LU': { x: 50, y: 37, name: 'Luxembourg' },
  'MT': { x: 52, y: 45, name: 'Malta' },
  'IS': { x: 48, y: 22, name: 'Iceland' },
  'AD': { x: 48, y: 40, name: 'Andorra' },
  'MC': { x: 50, y: 41, name: 'Monaco' },
  'LI': { x: 51, y: 38, name: 'Liechtenstein' },
  'SM': { x: 52, y: 40, name: 'San Marino' },
  'VA': { x: 52, y: 42, name: 'Vatican City' },
  'Unknown': { x: 50, y: 50, name: 'Unknown' }
};

export const GeoMap: React.FC<GeoMapProps> = ({
  countryData,
  title = 'Request Distribution by Country',
  height = 400
}) => {
  const processedData = useMemo(() => {
    const maxCount = Math.max(...countryData.map(d => d.count), 1);

    return countryData.map(data => {
      const countryCode = Object.keys(countryCodeMap).find(
        code => countryCodeMap[code] === data.country
      ) || 'Unknown';

      const coords = countryCoordinates[countryCode];
      if (!coords) return null;

      const intensity = Math.max(0.1, data.count / maxCount);
      const size = Math.max(4, Math.min(20, 4 + (intensity * 16)));

      return {
        ...data,
        countryCode,
        x: coords.x,
        y: coords.y,
        intensity,
        size,
        displayName: coords.name
      };
    }).filter((data): data is NonNullable<typeof data> => data !== null);
  }, [countryData]);

  const totalRequests = countryData.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="geo-map-container">
      <div className="geo-map-header">
        <h3>{title}</h3>
        <div className="geo-map-stats">
          <span>Total Requests: {totalRequests.toLocaleString()}</span>
          <span>Countries: {countryData.length}</span>
        </div>
      </div>

      <div className="geo-map-wrapper" style={{ height }}>
        <svg
          viewBox="0 0 100 100"
          className="geo-map-svg"
          style={{ width: '100%', height: '100%' }}
        >
          {/* World map outline (simplified) */}
          <g className="world-outline">
            {/* North America */}
            <path
              d="M 15 35 L 25 35 L 25 45 L 15 45 Z"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="0.5"
            />
            {/* South America */}
            <path
              d="M 25 55 L 35 55 L 35 75 L 25 75 Z"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="0.5"
            />
            {/* Europe */}
            <path
              d="M 45 30 L 60 30 L 60 45 L 45 45 Z"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="0.5"
            />
            {/* Africa */}
            <path
              d="M 50 45 L 65 45 L 65 70 L 50 70 Z"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="0.5"
            />
            {/* Asia */}
            <path
              d="M 65 30 L 90 30 L 90 60 L 65 60 Z"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="0.5"
            />
            {/* Australia */}
            <path
              d="M 75 70 L 85 70 L 85 80 L 75 80 Z"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="0.5"
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

      {/* Top countries list */}
      <div className="geo-map-countries">
        <h4>Top Countries</h4>
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