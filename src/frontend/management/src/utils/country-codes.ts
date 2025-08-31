// Country code to country name mapping
export const countryCodeMap: { [key: string]: string } = {
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
  'KP': 'North Korea',
  'IR': 'Iran',
  'IQ': 'Iraq',
  'AF': 'Afghanistan',
  'PK': 'Pakistan',
  'BD': 'Bangladesh',
  'LK': 'Sri Lanka',
  'NP': 'Nepal',
  'MM': 'Myanmar',
  'KH': 'Cambodia',
  'LA': 'Laos',
  'MN': 'Mongolia',
  'KZ': 'Kazakhstan',
  'UZ': 'Uzbekistan',
  'KG': 'Kyrgyzstan',
  'TJ': 'Tajikistan',
  'TM': 'Turkmenistan',
  'AZ': 'Azerbaijan',
  'GE': 'Georgia',
  'AM': 'Armenia',
  'BY': 'Belarus',
  'MD': 'Moldova',
  'UA': 'Ukraine',
  'RS': 'Serbia',
  'ME': 'Montenegro',
  'BA': 'Bosnia and Herzegovina',
  'MK': 'North Macedonia',
  'AL': 'Albania',
  'XK': 'Kosovo',
  'Local': 'Local Network',
  'Unknown': 'Unknown'
};

/**
 * Convert a country code to its full name
 * @param countryCode - The ISO 3166-1 alpha-2 country code
 * @returns The full country name, or the original code if not found
 */
export function getCountryName(countryCode: string): string {
  if (!countryCode) return 'Unknown';
  
  // Handle special cases
  if (countryCode === 'Local') return 'Local Network';
  if (countryCode === 'Unknown') return 'Unknown';
  
  return countryCodeMap[countryCode] || countryCode;
}

/**
 * Convert multiple country codes to country names
 * @param countryCodes - Array of country codes
 * @returns Array of country names
 */
export function getCountryNames(countryCodes: string[]): string[] {
  return countryCodes.map(code => getCountryName(code));
}
