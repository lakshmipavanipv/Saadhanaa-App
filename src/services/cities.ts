/**
 * cities — curated list of common cities (with lat/lng/timezone) for
 * the family-member death-location picker. Falls back to free Nominatim
 * (OpenStreetMap) geocoding for any city not in the list.
 *
 * Covers major Indian cities, big NRI hubs (US, UK, Canada, Australia,
 * Middle East), and capitals of other Asian/European countries.
 */

import { DeathLocation } from '../types';

const CITIES: DeathLocation[] = [
  // ── India (most common) ──
  { name: 'Mumbai',      country: 'India', lat: 19.0760, lng: 72.8777, tz: 'Asia/Kolkata' },
  { name: 'Delhi',       country: 'India', lat: 28.6139, lng: 77.2090, tz: 'Asia/Kolkata' },
  { name: 'Bengaluru',   country: 'India', lat: 12.9716, lng: 77.5946, tz: 'Asia/Kolkata' },
  { name: 'Chennai',     country: 'India', lat: 13.0827, lng: 80.2707, tz: 'Asia/Kolkata' },
  { name: 'Kolkata',     country: 'India', lat: 22.5726, lng: 88.3639, tz: 'Asia/Kolkata' },
  { name: 'Hyderabad',   country: 'India', lat: 17.3850, lng: 78.4867, tz: 'Asia/Kolkata' },
  { name: 'Pune',        country: 'India', lat: 18.5204, lng: 73.8567, tz: 'Asia/Kolkata' },
  { name: 'Ahmedabad',   country: 'India', lat: 23.0225, lng: 72.5714, tz: 'Asia/Kolkata' },
  { name: 'Jaipur',      country: 'India', lat: 26.9124, lng: 75.7873, tz: 'Asia/Kolkata' },
  { name: 'Lucknow',     country: 'India', lat: 26.8467, lng: 80.9462, tz: 'Asia/Kolkata' },
  { name: 'Surat',       country: 'India', lat: 21.1702, lng: 72.8311, tz: 'Asia/Kolkata' },
  { name: 'Kanpur',      country: 'India', lat: 26.4499, lng: 80.3319, tz: 'Asia/Kolkata' },
  { name: 'Nagpur',      country: 'India', lat: 21.1458, lng: 79.0882, tz: 'Asia/Kolkata' },
  { name: 'Indore',      country: 'India', lat: 22.7196, lng: 75.8577, tz: 'Asia/Kolkata' },
  { name: 'Bhopal',      country: 'India', lat: 23.2599, lng: 77.4126, tz: 'Asia/Kolkata' },
  { name: 'Patna',       country: 'India', lat: 25.5941, lng: 85.1376, tz: 'Asia/Kolkata' },
  { name: 'Vadodara',    country: 'India', lat: 22.3072, lng: 73.1812, tz: 'Asia/Kolkata' },
  { name: 'Coimbatore',  country: 'India', lat: 11.0168, lng: 76.9558, tz: 'Asia/Kolkata' },
  { name: 'Visakhapatnam', country: 'India', lat: 17.6868, lng: 83.2185, tz: 'Asia/Kolkata' },
  { name: 'Vijayawada',  country: 'India', lat: 16.5062, lng: 80.6480, tz: 'Asia/Kolkata' },
  { name: 'Tirupati',    country: 'India', lat: 13.6288, lng: 79.4192, tz: 'Asia/Kolkata' },
  { name: 'Varanasi',    country: 'India', lat: 25.3176, lng: 82.9739, tz: 'Asia/Kolkata' },
  { name: 'Haridwar',    country: 'India', lat: 29.9457, lng: 78.1642, tz: 'Asia/Kolkata' },
  { name: 'Rishikesh',   country: 'India', lat: 30.0869, lng: 78.2676, tz: 'Asia/Kolkata' },
  { name: 'Tirunelveli', country: 'India', lat: 8.7139,  lng: 77.7567, tz: 'Asia/Kolkata' },
  { name: 'Madurai',     country: 'India', lat: 9.9252,  lng: 78.1198, tz: 'Asia/Kolkata' },
  { name: 'Mysuru',      country: 'India', lat: 12.2958, lng: 76.6394, tz: 'Asia/Kolkata' },
  { name: 'Kochi',       country: 'India', lat: 9.9312,  lng: 76.2673, tz: 'Asia/Kolkata' },
  { name: 'Thiruvananthapuram', country: 'India', lat: 8.5241, lng: 76.9366, tz: 'Asia/Kolkata' },
  { name: 'Guwahati',    country: 'India', lat: 26.1445, lng: 91.7362, tz: 'Asia/Kolkata' },
  { name: 'Chandigarh',  country: 'India', lat: 30.7333, lng: 76.7794, tz: 'Asia/Kolkata' },
  { name: 'Amritsar',    country: 'India', lat: 31.6340, lng: 74.8723, tz: 'Asia/Kolkata' },

  // ── USA (NRI hubs) ──
  { name: 'New York',    country: 'USA', lat: 40.7128, lng: -74.0060, tz: 'America/New_York' },
  { name: 'New Jersey (Edison)', country: 'USA', lat: 40.5187, lng: -74.4121, tz: 'America/New_York' },
  { name: 'Chicago',     country: 'USA', lat: 41.8781, lng: -87.6298, tz: 'America/Chicago' },
  { name: 'San Francisco', country: 'USA', lat: 37.7749, lng: -122.4194, tz: 'America/Los_Angeles' },
  { name: 'San Jose',    country: 'USA', lat: 37.3382, lng: -121.8863, tz: 'America/Los_Angeles' },
  { name: 'Los Angeles', country: 'USA', lat: 34.0522, lng: -118.2437, tz: 'America/Los_Angeles' },
  { name: 'Seattle',     country: 'USA', lat: 47.6062, lng: -122.3321, tz: 'America/Los_Angeles' },
  { name: 'Houston',     country: 'USA', lat: 29.7604, lng: -95.3698, tz: 'America/Chicago' },
  { name: 'Dallas',      country: 'USA', lat: 32.7767, lng: -96.7970, tz: 'America/Chicago' },
  { name: 'Atlanta',     country: 'USA', lat: 33.7490, lng: -84.3880, tz: 'America/New_York' },
  { name: 'Washington DC', country: 'USA', lat: 38.9072, lng: -77.0369, tz: 'America/New_York' },
  { name: 'Boston',      country: 'USA', lat: 42.3601, lng: -71.0589, tz: 'America/New_York' },

  // ── Canada ──
  { name: 'Toronto',     country: 'Canada', lat: 43.6532, lng: -79.3832, tz: 'America/Toronto' },
  { name: 'Vancouver',   country: 'Canada', lat: 49.2827, lng: -123.1207, tz: 'America/Vancouver' },
  { name: 'Calgary',     country: 'Canada', lat: 51.0447, lng: -114.0719, tz: 'America/Edmonton' },
  { name: 'Montreal',    country: 'Canada', lat: 45.5017, lng: -73.5673, tz: 'America/Toronto' },
  { name: 'Ottawa',      country: 'Canada', lat: 45.4215, lng: -75.6972, tz: 'America/Toronto' },

  // ── UK ──
  { name: 'London',      country: 'UK', lat: 51.5074, lng: -0.1278, tz: 'Europe/London' },
  { name: 'Manchester',  country: 'UK', lat: 53.4808, lng: -2.2426, tz: 'Europe/London' },
  { name: 'Birmingham',  country: 'UK', lat: 52.4862, lng: -1.8904, tz: 'Europe/London' },
  { name: 'Leicester',   country: 'UK', lat: 52.6369, lng: -1.1398, tz: 'Europe/London' },

  // ── Australia / NZ ──
  { name: 'Sydney',      country: 'Australia', lat: -33.8688, lng: 151.2093, tz: 'Australia/Sydney' },
  { name: 'Melbourne',   country: 'Australia', lat: -37.8136, lng: 144.9631, tz: 'Australia/Melbourne' },
  { name: 'Brisbane',    country: 'Australia', lat: -27.4698, lng: 153.0251, tz: 'Australia/Brisbane' },
  { name: 'Perth',       country: 'Australia', lat: -31.9505, lng: 115.8605, tz: 'Australia/Perth' },
  { name: 'Auckland',    country: 'New Zealand', lat: -36.8485, lng: 174.7633, tz: 'Pacific/Auckland' },

  // ── Middle East ──
  { name: 'Dubai',       country: 'UAE',      lat: 25.2048, lng: 55.2708, tz: 'Asia/Dubai' },
  { name: 'Abu Dhabi',   country: 'UAE',      lat: 24.4539, lng: 54.3773, tz: 'Asia/Dubai' },
  { name: 'Doha',        country: 'Qatar',    lat: 25.2854, lng: 51.5310, tz: 'Asia/Qatar' },
  { name: 'Riyadh',      country: 'Saudi Arabia', lat: 24.7136, lng: 46.6753, tz: 'Asia/Riyadh' },
  { name: 'Muscat',      country: 'Oman',     lat: 23.5859, lng: 58.4059, tz: 'Asia/Muscat' },

  // ── South-East Asia ──
  { name: 'Singapore',   country: 'Singapore',   lat: 1.3521,  lng: 103.8198, tz: 'Asia/Singapore' },
  { name: 'Kuala Lumpur', country: 'Malaysia',   lat: 3.1390,  lng: 101.6869, tz: 'Asia/Kuala_Lumpur' },
  { name: 'Bangkok',     country: 'Thailand',   lat: 13.7563, lng: 100.5018, tz: 'Asia/Bangkok' },
  { name: 'Hong Kong',   country: 'Hong Kong',  lat: 22.3193, lng: 114.1694, tz: 'Asia/Hong_Kong' },
  { name: 'Tokyo',       country: 'Japan',      lat: 35.6762, lng: 139.6503, tz: 'Asia/Tokyo' },

  // ── Europe + others ──
  { name: 'Frankfurt',   country: 'Germany',  lat: 50.1109, lng: 8.6821,  tz: 'Europe/Berlin' },
  { name: 'Paris',       country: 'France',   lat: 48.8566, lng: 2.3522,  tz: 'Europe/Paris' },
  { name: 'Amsterdam',   country: 'Netherlands', lat: 52.3676, lng: 4.9041, tz: 'Europe/Amsterdam' },
  { name: 'Zurich',      country: 'Switzerland', lat: 47.3769, lng: 8.5417, tz: 'Europe/Zurich' },
  { name: 'Johannesburg', country: 'South Africa', lat: -26.2041, lng: 28.0473, tz: 'Africa/Johannesburg' },
];

export const allCities = (): DeathLocation[] => CITIES;

/** Substring search across name + country. */
export const searchCities = (q: string, limit = 12): DeathLocation[] => {
  const needle = q.trim().toLowerCase();
  if (!needle) return CITIES.slice(0, limit);
  return CITIES
    .filter(c =>
      c.name.toLowerCase().includes(needle) ||
      c.country.toLowerCase().includes(needle)
    )
    .slice(0, limit);
};

/**
 * Fallback: geocode any city via OpenStreetMap Nominatim (free, no key).
 * Returns null on failure. Timezone is best-effort — caller may need to
 * confirm with the user.
 */
export const geocodeCity = async (
  query: string
): Promise<DeathLocation | null> => {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return null;
    const arr = await res.json();
    const r = Array.isArray(arr) ? arr[0] : null;
    if (!r) return null;
    return {
      name: r.display_name?.split(',')[0]?.trim() || query,
      country: r.display_name?.split(',').slice(-1)[0]?.trim() || '',
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      tz: 'UTC',   // unknown — caller can override
    };
  } catch {
    return null;
  }
};
