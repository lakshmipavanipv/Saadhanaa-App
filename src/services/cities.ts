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
  // ── India · metros + tier-1 ──
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

  // ── India · all state capitals & UTs ──
  { name: 'Itanagar',     country: 'India', lat: 27.0844, lng: 93.6053, tz: 'Asia/Kolkata' },  // Arunachal Pradesh
  { name: 'Dispur',       country: 'India', lat: 26.1433, lng: 91.7898, tz: 'Asia/Kolkata' },  // Assam
  { name: 'Raipur',       country: 'India', lat: 21.2514, lng: 81.6296, tz: 'Asia/Kolkata' },  // Chhattisgarh
  { name: 'Panaji',       country: 'India', lat: 15.4909, lng: 73.8278, tz: 'Asia/Kolkata' },  // Goa
  { name: 'Gandhinagar',  country: 'India', lat: 23.2156, lng: 72.6369, tz: 'Asia/Kolkata' },  // Gujarat
  { name: 'Shimla',       country: 'India', lat: 31.1048, lng: 77.1734, tz: 'Asia/Kolkata' },  // Himachal Pradesh
  { name: 'Srinagar',     country: 'India', lat: 34.0837, lng: 74.7973, tz: 'Asia/Kolkata' },  // J&K (summer)
  { name: 'Jammu',        country: 'India', lat: 32.7266, lng: 74.8570, tz: 'Asia/Kolkata' },  // J&K (winter)
  { name: 'Ranchi',       country: 'India', lat: 23.3441, lng: 85.3096, tz: 'Asia/Kolkata' },  // Jharkhand
  { name: 'Thiruvananthapuram', country: 'India', lat: 8.5241, lng: 76.9366, tz: 'Asia/Kolkata' },  // Kerala
  { name: 'Imphal',       country: 'India', lat: 24.8170, lng: 93.9368, tz: 'Asia/Kolkata' },  // Manipur
  { name: 'Shillong',     country: 'India', lat: 25.5788, lng: 91.8933, tz: 'Asia/Kolkata' },  // Meghalaya
  { name: 'Aizawl',       country: 'India', lat: 23.7307, lng: 92.7173, tz: 'Asia/Kolkata' },  // Mizoram
  { name: 'Kohima',       country: 'India', lat: 25.6751, lng: 94.1086, tz: 'Asia/Kolkata' },  // Nagaland
  { name: 'Bhubaneswar',  country: 'India', lat: 20.2961, lng: 85.8245, tz: 'Asia/Kolkata' },  // Odisha
  { name: 'Gangtok',      country: 'India', lat: 27.3389, lng: 88.6065, tz: 'Asia/Kolkata' },  // Sikkim
  { name: 'Agartala',     country: 'India', lat: 23.8315, lng: 91.2868, tz: 'Asia/Kolkata' },  // Tripura
  { name: 'Dehradun',     country: 'India', lat: 30.3165, lng: 78.0322, tz: 'Asia/Kolkata' },  // Uttarakhand

  // ── India · UTs ──
  { name: 'Port Blair',   country: 'India', lat: 11.6234, lng: 92.7265, tz: 'Asia/Kolkata' },  // A&N Islands
  { name: 'Silvassa',     country: 'India', lat: 20.2738, lng: 73.0140, tz: 'Asia/Kolkata' },  // D&D + DNH
  { name: 'Kavaratti',    country: 'India', lat: 10.5667, lng: 72.6417, tz: 'Asia/Kolkata' },  // Lakshadweep
  { name: 'Puducherry',   country: 'India', lat: 11.9416, lng: 79.8083, tz: 'Asia/Kolkata' },
  { name: 'Leh',          country: 'India', lat: 34.1526, lng: 77.5771, tz: 'Asia/Kolkata' },  // Ladakh

  // ── India · pilgrimage / cultural cities ──
  { name: 'Ayodhya',      country: 'India', lat: 26.7922, lng: 82.1998, tz: 'Asia/Kolkata' },
  { name: 'Mathura',      country: 'India', lat: 27.4924, lng: 77.6737, tz: 'Asia/Kolkata' },
  { name: 'Vrindavan',    country: 'India', lat: 27.5806, lng: 77.7006, tz: 'Asia/Kolkata' },
  { name: 'Puri',         country: 'India', lat: 19.8135, lng: 85.8312, tz: 'Asia/Kolkata' },
  { name: 'Dwarka',       country: 'India', lat: 22.2394, lng: 68.9678, tz: 'Asia/Kolkata' },
  { name: 'Rameswaram',   country: 'India', lat: 9.2876,  lng: 79.3129, tz: 'Asia/Kolkata' },
  { name: 'Badrinath',    country: 'India', lat: 30.7433, lng: 79.4938, tz: 'Asia/Kolkata' },
  { name: 'Kedarnath',    country: 'India', lat: 30.7346, lng: 79.0669, tz: 'Asia/Kolkata' },
  { name: 'Ujjain',       country: 'India', lat: 23.1765, lng: 75.7885, tz: 'Asia/Kolkata' },
  { name: 'Nashik',       country: 'India', lat: 19.9975, lng: 73.7898, tz: 'Asia/Kolkata' },
  { name: 'Allahabad / Prayagraj', country: 'India', lat: 25.4358, lng: 81.8463, tz: 'Asia/Kolkata' },
  { name: 'Bodh Gaya',    country: 'India', lat: 24.6960, lng: 84.9912, tz: 'Asia/Kolkata' },
  { name: 'Amarnath',     country: 'India', lat: 34.2150, lng: 75.5009, tz: 'Asia/Kolkata' },
  { name: 'Vaishno Devi (Katra)', country: 'India', lat: 32.9919, lng: 74.9337, tz: 'Asia/Kolkata' },
  { name: 'Tirumala',     country: 'India', lat: 13.6833, lng: 79.3500, tz: 'Asia/Kolkata' },
  { name: 'Sabarimala',   country: 'India', lat: 9.4361,  lng: 77.0814, tz: 'Asia/Kolkata' },
  { name: 'Shirdi',       country: 'India', lat: 19.7645, lng: 74.4769, tz: 'Asia/Kolkata' },
  { name: 'Pandharpur',   country: 'India', lat: 17.6794, lng: 75.3245, tz: 'Asia/Kolkata' },
  { name: 'Kanchipuram',  country: 'India', lat: 12.8342, lng: 79.7036, tz: 'Asia/Kolkata' },
  { name: 'Chidambaram',  country: 'India', lat: 11.3994, lng: 79.6961, tz: 'Asia/Kolkata' },
  { name: 'Srirangam',    country: 'India', lat: 10.8624, lng: 78.6885, tz: 'Asia/Kolkata' },
  { name: 'Guruvayur',    country: 'India', lat: 10.5944, lng: 76.0419, tz: 'Asia/Kolkata' },
  { name: 'Palani',       country: 'India', lat: 10.4501, lng: 77.5163, tz: 'Asia/Kolkata' },
  { name: 'Tiruchirappalli', country: 'India', lat: 10.7905, lng: 78.7047, tz: 'Asia/Kolkata' },
  { name: 'Salem',        country: 'India', lat: 11.6643, lng: 78.1460, tz: 'Asia/Kolkata' },
  { name: 'Erode',        country: 'India', lat: 11.3410, lng: 77.7172, tz: 'Asia/Kolkata' },
  { name: 'Vellore',      country: 'India', lat: 12.9165, lng: 79.1325, tz: 'Asia/Kolkata' },
  { name: 'Mangaluru',    country: 'India', lat: 12.9141, lng: 74.8560, tz: 'Asia/Kolkata' },
  { name: 'Hubballi',     country: 'India', lat: 15.3647, lng: 75.1240, tz: 'Asia/Kolkata' },
  { name: 'Belagavi',     country: 'India', lat: 15.8497, lng: 74.4977, tz: 'Asia/Kolkata' },
  { name: 'Tumakuru',     country: 'India', lat: 13.3409, lng: 77.1010, tz: 'Asia/Kolkata' },
  { name: 'Davanagere',   country: 'India', lat: 14.4644, lng: 75.9217, tz: 'Asia/Kolkata' },
  { name: 'Kurnool',      country: 'India', lat: 15.8281, lng: 78.0373, tz: 'Asia/Kolkata' },
  { name: 'Nellore',      country: 'India', lat: 14.4426, lng: 79.9865, tz: 'Asia/Kolkata' },
  { name: 'Guntur',       country: 'India', lat: 16.3067, lng: 80.4365, tz: 'Asia/Kolkata' },
  { name: 'Rajahmundry',  country: 'India', lat: 17.0005, lng: 81.8040, tz: 'Asia/Kolkata' },
  { name: 'Warangal',     country: 'India', lat: 17.9689, lng: 79.5941, tz: 'Asia/Kolkata' },
  { name: 'Karimnagar',   country: 'India', lat: 18.4386, lng: 79.1288, tz: 'Asia/Kolkata' },
  { name: 'Nizamabad',    country: 'India', lat: 18.6725, lng: 78.0941, tz: 'Asia/Kolkata' },
  { name: 'Aurangabad',   country: 'India', lat: 19.8762, lng: 75.3433, tz: 'Asia/Kolkata' },
  { name: 'Solapur',      country: 'India', lat: 17.6599, lng: 75.9064, tz: 'Asia/Kolkata' },
  { name: 'Kolhapur',     country: 'India', lat: 16.7050, lng: 74.2433, tz: 'Asia/Kolkata' },
  { name: 'Thane',        country: 'India', lat: 19.2183, lng: 72.9781, tz: 'Asia/Kolkata' },
  { name: 'Navi Mumbai',  country: 'India', lat: 19.0330, lng: 73.0297, tz: 'Asia/Kolkata' },
  { name: 'Rajkot',       country: 'India', lat: 22.3039, lng: 70.8022, tz: 'Asia/Kolkata' },
  { name: 'Bhavnagar',    country: 'India', lat: 21.7645, lng: 72.1519, tz: 'Asia/Kolkata' },
  { name: 'Jamnagar',     country: 'India', lat: 22.4707, lng: 70.0577, tz: 'Asia/Kolkata' },
  { name: 'Junagadh',     country: 'India', lat: 21.5222, lng: 70.4579, tz: 'Asia/Kolkata' },
  { name: 'Jodhpur',      country: 'India', lat: 26.2389, lng: 73.0243, tz: 'Asia/Kolkata' },
  { name: 'Udaipur',      country: 'India', lat: 24.5854, lng: 73.7125, tz: 'Asia/Kolkata' },
  { name: 'Kota',         country: 'India', lat: 25.2138, lng: 75.8648, tz: 'Asia/Kolkata' },
  { name: 'Ajmer',        country: 'India', lat: 26.4499, lng: 74.6399, tz: 'Asia/Kolkata' },
  { name: 'Bikaner',      country: 'India', lat: 28.0229, lng: 73.3119, tz: 'Asia/Kolkata' },
  { name: 'Agra',         country: 'India', lat: 27.1767, lng: 78.0081, tz: 'Asia/Kolkata' },
  { name: 'Meerut',       country: 'India', lat: 28.9845, lng: 77.7064, tz: 'Asia/Kolkata' },
  { name: 'Aligarh',      country: 'India', lat: 27.8974, lng: 78.0880, tz: 'Asia/Kolkata' },
  { name: 'Bareilly',     country: 'India', lat: 28.3670, lng: 79.4304, tz: 'Asia/Kolkata' },
  { name: 'Moradabad',    country: 'India', lat: 28.8389, lng: 78.7378, tz: 'Asia/Kolkata' },
  { name: 'Saharanpur',   country: 'India', lat: 29.9680, lng: 77.5552, tz: 'Asia/Kolkata' },
  { name: 'Ghaziabad',    country: 'India', lat: 28.6692, lng: 77.4538, tz: 'Asia/Kolkata' },
  { name: 'Noida',        country: 'India', lat: 28.5355, lng: 77.3910, tz: 'Asia/Kolkata' },
  { name: 'Gurugram',     country: 'India', lat: 28.4595, lng: 77.0266, tz: 'Asia/Kolkata' },
  { name: 'Faridabad',    country: 'India', lat: 28.4089, lng: 77.3178, tz: 'Asia/Kolkata' },
  { name: 'Rohtak',       country: 'India', lat: 28.8955, lng: 76.6066, tz: 'Asia/Kolkata' },
  { name: 'Ludhiana',     country: 'India', lat: 30.9010, lng: 75.8573, tz: 'Asia/Kolkata' },
  { name: 'Jalandhar',    country: 'India', lat: 31.3260, lng: 75.5762, tz: 'Asia/Kolkata' },
  { name: 'Patiala',      country: 'India', lat: 30.3398, lng: 76.3869, tz: 'Asia/Kolkata' },
  { name: 'Gwalior',      country: 'India', lat: 26.2183, lng: 78.1828, tz: 'Asia/Kolkata' },
  { name: 'Jabalpur',     country: 'India', lat: 23.1815, lng: 79.9864, tz: 'Asia/Kolkata' },
  { name: 'Ujjain',       country: 'India', lat: 23.1765, lng: 75.7885, tz: 'Asia/Kolkata' },
  { name: 'Sagar',        country: 'India', lat: 23.8388, lng: 78.7378, tz: 'Asia/Kolkata' },
  { name: 'Cuttack',      country: 'India', lat: 20.4625, lng: 85.8828, tz: 'Asia/Kolkata' },
  { name: 'Rourkela',     country: 'India', lat: 22.2604, lng: 84.8536, tz: 'Asia/Kolkata' },
  { name: 'Dhanbad',      country: 'India', lat: 23.7957, lng: 86.4304, tz: 'Asia/Kolkata' },
  { name: 'Jamshedpur',   country: 'India', lat: 22.8046, lng: 86.2029, tz: 'Asia/Kolkata' },
  { name: 'Gaya',         country: 'India', lat: 24.7914, lng: 85.0002, tz: 'Asia/Kolkata' },
  { name: 'Muzaffarpur',  country: 'India', lat: 26.1209, lng: 85.3647, tz: 'Asia/Kolkata' },
  { name: 'Bhagalpur',    country: 'India', lat: 25.2425, lng: 86.9842, tz: 'Asia/Kolkata' },
  { name: 'Darbhanga',    country: 'India', lat: 26.1542, lng: 85.8918, tz: 'Asia/Kolkata' },
  { name: 'Asansol',      country: 'India', lat: 23.6739, lng: 86.9524, tz: 'Asia/Kolkata' },
  { name: 'Siliguri',     country: 'India', lat: 26.7271, lng: 88.3953, tz: 'Asia/Kolkata' },
  { name: 'Durgapur',     country: 'India', lat: 23.5204, lng: 87.3119, tz: 'Asia/Kolkata' },
  { name: 'Howrah',       country: 'India', lat: 22.5958, lng: 88.2636, tz: 'Asia/Kolkata' },
  { name: 'Kollam',       country: 'India', lat: 8.8932,  lng: 76.6141, tz: 'Asia/Kolkata' },
  { name: 'Thrissur',     country: 'India', lat: 10.5276, lng: 76.2144, tz: 'Asia/Kolkata' },
  { name: 'Kannur',       country: 'India', lat: 11.8745, lng: 75.3704, tz: 'Asia/Kolkata' },
  { name: 'Kozhikode',    country: 'India', lat: 11.2588, lng: 75.7804, tz: 'Asia/Kolkata' },

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

  // ── USA · more cities ──
  { name: 'Philadelphia', country: 'USA', lat: 39.9526, lng: -75.1652, tz: 'America/New_York' },
  { name: 'Phoenix',     country: 'USA', lat: 33.4484, lng: -112.0740, tz: 'America/Phoenix' },
  { name: 'San Antonio', country: 'USA', lat: 29.4241, lng: -98.4936, tz: 'America/Chicago' },
  { name: 'San Diego',   country: 'USA', lat: 32.7157, lng: -117.1611, tz: 'America/Los_Angeles' },
  { name: 'Detroit',     country: 'USA', lat: 42.3314, lng: -83.0458, tz: 'America/Detroit' },
  { name: 'Denver',      country: 'USA', lat: 39.7392, lng: -104.9903, tz: 'America/Denver' },
  { name: 'Miami',       country: 'USA', lat: 25.7617, lng: -80.1918, tz: 'America/New_York' },
  { name: 'Orlando',     country: 'USA', lat: 28.5384, lng: -81.3789, tz: 'America/New_York' },
  { name: 'Minneapolis', country: 'USA', lat: 44.9778, lng: -93.2650, tz: 'America/Chicago' },
  { name: 'Charlotte',   country: 'USA', lat: 35.2271, lng: -80.8431, tz: 'America/New_York' },
  { name: 'Raleigh',     country: 'USA', lat: 35.7796, lng: -78.6382, tz: 'America/New_York' },
  { name: 'Austin',      country: 'USA', lat: 30.2672, lng: -97.7431, tz: 'America/Chicago' },
  { name: 'Portland',    country: 'USA', lat: 45.5152, lng: -122.6784, tz: 'America/Los_Angeles' },

  // ── UK / Ireland ──
  { name: 'Glasgow',     country: 'UK', lat: 55.8642, lng: -4.2518, tz: 'Europe/London' },
  { name: 'Edinburgh',   country: 'UK', lat: 55.9533, lng: -3.1883, tz: 'Europe/London' },
  { name: 'Liverpool',   country: 'UK', lat: 53.4084, lng: -2.9916, tz: 'Europe/London' },
  { name: 'Bristol',     country: 'UK', lat: 51.4545, lng: -2.5879, tz: 'Europe/London' },
  { name: 'Cardiff',     country: 'UK', lat: 51.4816, lng: -3.1791, tz: 'Europe/London' },
  { name: 'Dublin',      country: 'Ireland', lat: 53.3498, lng: -6.2603, tz: 'Europe/Dublin' },

  // ── Europe ──
  { name: 'Frankfurt',   country: 'Germany',     lat: 50.1109, lng: 8.6821,   tz: 'Europe/Berlin' },
  { name: 'Berlin',      country: 'Germany',     lat: 52.5200, lng: 13.4050,  tz: 'Europe/Berlin' },
  { name: 'Munich',      country: 'Germany',     lat: 48.1351, lng: 11.5820,  tz: 'Europe/Berlin' },
  { name: 'Hamburg',     country: 'Germany',     lat: 53.5511, lng: 9.9937,   tz: 'Europe/Berlin' },
  { name: 'Paris',       country: 'France',      lat: 48.8566, lng: 2.3522,   tz: 'Europe/Paris' },
  { name: 'Marseille',   country: 'France',      lat: 43.2965, lng: 5.3698,   tz: 'Europe/Paris' },
  { name: 'Lyon',        country: 'France',      lat: 45.7640, lng: 4.8357,   tz: 'Europe/Paris' },
  { name: 'Amsterdam',   country: 'Netherlands', lat: 52.3676, lng: 4.9041,   tz: 'Europe/Amsterdam' },
  { name: 'Rotterdam',   country: 'Netherlands', lat: 51.9244, lng: 4.4777,   tz: 'Europe/Amsterdam' },
  { name: 'Brussels',    country: 'Belgium',     lat: 50.8503, lng: 4.3517,   tz: 'Europe/Brussels' },
  { name: 'Zurich',      country: 'Switzerland', lat: 47.3769, lng: 8.5417,   tz: 'Europe/Zurich' },
  { name: 'Geneva',      country: 'Switzerland', lat: 46.2044, lng: 6.1432,   tz: 'Europe/Zurich' },
  { name: 'Vienna',      country: 'Austria',     lat: 48.2082, lng: 16.3738,  tz: 'Europe/Vienna' },
  { name: 'Madrid',      country: 'Spain',       lat: 40.4168, lng: -3.7038,  tz: 'Europe/Madrid' },
  { name: 'Barcelona',   country: 'Spain',       lat: 41.3851, lng: 2.1734,   tz: 'Europe/Madrid' },
  { name: 'Lisbon',      country: 'Portugal',    lat: 38.7223, lng: -9.1393,  tz: 'Europe/Lisbon' },
  { name: 'Rome',        country: 'Italy',       lat: 41.9028, lng: 12.4964,  tz: 'Europe/Rome' },
  { name: 'Milan',       country: 'Italy',       lat: 45.4642, lng: 9.1900,   tz: 'Europe/Rome' },
  { name: 'Stockholm',   country: 'Sweden',      lat: 59.3293, lng: 18.0686,  tz: 'Europe/Stockholm' },
  { name: 'Oslo',        country: 'Norway',      lat: 59.9139, lng: 10.7522,  tz: 'Europe/Oslo' },
  { name: 'Copenhagen',  country: 'Denmark',     lat: 55.6761, lng: 12.5683,  tz: 'Europe/Copenhagen' },
  { name: 'Helsinki',    country: 'Finland',     lat: 60.1699, lng: 24.9384,  tz: 'Europe/Helsinki' },
  { name: 'Warsaw',      country: 'Poland',      lat: 52.2297, lng: 21.0122,  tz: 'Europe/Warsaw' },
  { name: 'Moscow',      country: 'Russia',      lat: 55.7558, lng: 37.6173,  tz: 'Europe/Moscow' },
  { name: 'Istanbul',    country: 'Turkey',      lat: 41.0082, lng: 28.9784,  tz: 'Europe/Istanbul' },

  // ── Asia (more) ──
  { name: 'Beijing',     country: 'China',       lat: 39.9042, lng: 116.4074, tz: 'Asia/Shanghai' },
  { name: 'Shanghai',    country: 'China',       lat: 31.2304, lng: 121.4737, tz: 'Asia/Shanghai' },
  { name: 'Seoul',       country: 'South Korea', lat: 37.5665, lng: 126.9780, tz: 'Asia/Seoul' },
  { name: 'Osaka',       country: 'Japan',       lat: 34.6937, lng: 135.5023, tz: 'Asia/Tokyo' },
  { name: 'Jakarta',     country: 'Indonesia',   lat: -6.2088, lng: 106.8456, tz: 'Asia/Jakarta' },
  { name: 'Manila',      country: 'Philippines', lat: 14.5995, lng: 120.9842, tz: 'Asia/Manila' },
  { name: 'Ho Chi Minh City', country: 'Vietnam', lat: 10.8231, lng: 106.6297, tz: 'Asia/Ho_Chi_Minh' },
  { name: 'Hanoi',       country: 'Vietnam',     lat: 21.0285, lng: 105.8542, tz: 'Asia/Ho_Chi_Minh' },
  { name: 'Colombo',     country: 'Sri Lanka',   lat: 6.9271,  lng: 79.8612,  tz: 'Asia/Colombo' },
  { name: 'Kathmandu',   country: 'Nepal',       lat: 27.7172, lng: 85.3240,  tz: 'Asia/Kathmandu' },
  { name: 'Dhaka',       country: 'Bangladesh',  lat: 23.8103, lng: 90.4125,  tz: 'Asia/Dhaka' },
  { name: 'Karachi',     country: 'Pakistan',    lat: 24.8607, lng: 67.0011,  tz: 'Asia/Karachi' },
  { name: 'Lahore',      country: 'Pakistan',    lat: 31.5497, lng: 74.3436,  tz: 'Asia/Karachi' },
  { name: 'Islamabad',   country: 'Pakistan',    lat: 33.6844, lng: 73.0479,  tz: 'Asia/Karachi' },
  { name: 'Kabul',       country: 'Afghanistan', lat: 34.5553, lng: 69.2075,  tz: 'Asia/Kabul' },
  { name: 'Tehran',      country: 'Iran',        lat: 35.6892, lng: 51.3890,  tz: 'Asia/Tehran' },
  { name: 'Tel Aviv',    country: 'Israel',      lat: 32.0853, lng: 34.7818,  tz: 'Asia/Jerusalem' },

  // ── Africa ──
  { name: 'Johannesburg', country: 'South Africa', lat: -26.2041, lng: 28.0473, tz: 'Africa/Johannesburg' },
  { name: 'Cape Town',    country: 'South Africa', lat: -33.9249, lng: 18.4241, tz: 'Africa/Johannesburg' },
  { name: 'Durban',       country: 'South Africa', lat: -29.8587, lng: 31.0218, tz: 'Africa/Johannesburg' },
  { name: 'Nairobi',      country: 'Kenya',        lat: -1.2921, lng: 36.8219,  tz: 'Africa/Nairobi' },
  { name: 'Lagos',        country: 'Nigeria',      lat: 6.5244,  lng: 3.3792,   tz: 'Africa/Lagos' },
  { name: 'Cairo',        country: 'Egypt',        lat: 30.0444, lng: 31.2357,  tz: 'Africa/Cairo' },
  { name: 'Casablanca',   country: 'Morocco',      lat: 33.5731, lng: -7.5898,  tz: 'Africa/Casablanca' },

  // ── South America ──
  { name: 'São Paulo',    country: 'Brazil',    lat: -23.5505, lng: -46.6333,  tz: 'America/Sao_Paulo' },
  { name: 'Rio de Janeiro', country: 'Brazil',  lat: -22.9068, lng: -43.1729,  tz: 'America/Sao_Paulo' },
  { name: 'Buenos Aires', country: 'Argentina', lat: -34.6037, lng: -58.3816,  tz: 'America/Argentina/Buenos_Aires' },
  { name: 'Mexico City',  country: 'Mexico',    lat: 19.4326, lng: -99.1332,   tz: 'America/Mexico_City' },
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
 * Search ANY city via OpenStreetMap Nominatim (free, no key).
 * Returns up to N matches. Timezone is best-effort guessed from country.
 */
export const geocodeCities = async (
  query: string,
  limit = 6
): Promise<DeathLocation[]> => {
  if (!query.trim() || query.trim().length < 3) return [];
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=${limit}&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Saadhana-App/1.0' },
    });
    if (!res.ok) return [];
    const arr = await res.json();
    if (!Array.isArray(arr)) return [];
    return arr.map((r: any): DeathLocation => {
      const country = r.address?.country || r.display_name?.split(',').slice(-1)[0]?.trim() || '';
      const cityName =
        r.address?.city || r.address?.town || r.address?.village ||
        r.address?.suburb || r.display_name?.split(',')[0]?.trim() || query;
      return {
        name: cityName,
        country,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        tz: guessTzFromCountry(country),
      };
    });
  } catch {
    return [];
  }
};

/** Back-compat: single-result version. */
export const geocodeCity = async (query: string): Promise<DeathLocation | null> => {
  const arr = await geocodeCities(query, 1);
  return arr[0] || null;
};

/** Rough country → primary timezone map. UTC fallback. */
const COUNTRY_TZ: Record<string, string> = {
  India: 'Asia/Kolkata', USA: 'America/New_York', 'United States': 'America/New_York',
  Canada: 'America/Toronto', UK: 'Europe/London', 'United Kingdom': 'Europe/London',
  Ireland: 'Europe/Dublin', Germany: 'Europe/Berlin', France: 'Europe/Paris',
  Italy: 'Europe/Rome', Spain: 'Europe/Madrid', Portugal: 'Europe/Lisbon',
  Netherlands: 'Europe/Amsterdam', Belgium: 'Europe/Brussels', Switzerland: 'Europe/Zurich',
  Austria: 'Europe/Vienna', Sweden: 'Europe/Stockholm', Norway: 'Europe/Oslo',
  Denmark: 'Europe/Copenhagen', Finland: 'Europe/Helsinki', Poland: 'Europe/Warsaw',
  Russia: 'Europe/Moscow', Turkey: 'Europe/Istanbul',
  Australia: 'Australia/Sydney', 'New Zealand': 'Pacific/Auckland',
  Japan: 'Asia/Tokyo', China: 'Asia/Shanghai', 'South Korea': 'Asia/Seoul',
  Singapore: 'Asia/Singapore', Malaysia: 'Asia/Kuala_Lumpur', Thailand: 'Asia/Bangkok',
  'Hong Kong': 'Asia/Hong_Kong', Indonesia: 'Asia/Jakarta', Vietnam: 'Asia/Ho_Chi_Minh',
  Philippines: 'Asia/Manila', 'Sri Lanka': 'Asia/Colombo', Nepal: 'Asia/Kathmandu',
  Bangladesh: 'Asia/Dhaka', Pakistan: 'Asia/Karachi', Afghanistan: 'Asia/Kabul',
  UAE: 'Asia/Dubai', 'United Arab Emirates': 'Asia/Dubai',
  Qatar: 'Asia/Qatar', 'Saudi Arabia': 'Asia/Riyadh', Oman: 'Asia/Muscat',
  Iran: 'Asia/Tehran', Israel: 'Asia/Jerusalem',
  'South Africa': 'Africa/Johannesburg', Kenya: 'Africa/Nairobi',
  Nigeria: 'Africa/Lagos', Egypt: 'Africa/Cairo', Morocco: 'Africa/Casablanca',
  Brazil: 'America/Sao_Paulo', Argentina: 'America/Argentina/Buenos_Aires',
  Mexico: 'America/Mexico_City',
};
const guessTzFromCountry = (country: string): string =>
  COUNTRY_TZ[country] || 'UTC';
