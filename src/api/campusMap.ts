/**
 * Interactive Campus Map & Hall Locator API
 * Geocoded landmarks, faculty halls, libraries, and hostels for major Nigerian universities.
 * Integrated with OpenStreetMap Overpass API for live campus amenities (ATMs, food, health, study areas).
 */

export interface CampusLandmark {
  id: string;
  name: string;
  shortCode?: string;
  campus: string;
  category:
    | 'Lecture Hall'
    | 'Library'
    | 'Administrative'
    | 'Hostel'
    | 'Medical'
    | 'Food & Social'
    | 'Sports'
    | 'ATM & Bank';
  latitude: number;
  longitude: number;
  description: string;
  walkingTip?: string;
  amenityType?: string;
  isOsmLive?: boolean;
  distanceMeters?: number;
}

export interface CampusCenter {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
}

export const CAMPUS_CENTERS: Record<string, CampusCenter> = {
  UI: {
    code: 'UI',
    name: 'University of Ibadan',
    latitude: 7.4478,
    longitude: 3.8992,
  },
  UNILAG: {
    code: 'UNILAG',
    name: 'University of Lagos',
    latitude: 6.5168,
    longitude: 3.398,
  },
  OAU: {
    code: 'OAU',
    name: 'Obafemi Awolowo University',
    latitude: 7.5186,
    longitude: 4.5276,
  },
  UNN: {
    code: 'UNN',
    name: 'University of Nigeria, Nsukka',
    latitude: 6.8667,
    longitude: 7.4106,
  },
  CU: {
    code: 'CU',
    name: 'Covenant University',
    latitude: 6.6719,
    longitude: 3.161,
  },
  FUNAAB: {
    code: 'FUNAAB',
    name: 'Federal University of Agriculture, Abeokuta',
    latitude: 7.2246,
    longitude: 3.4439,
  },
  FUTA: {
    code: 'FUTA',
    name: 'Federal University of Technology, Akure',
    latitude: 7.3045,
    longitude: 5.1384,
  },
  ABU: {
    code: 'ABU',
    name: 'Ahmadu Bello University',
    latitude: 11.1558,
    longitude: 7.6497,
  },
};

export const CAMPUS_LANDMARKS: CampusLandmark[] = [
  // UNIVERSITY OF IBADAN (UI)
  {
    id: 'ui-trenchard-hall',
    name: 'Trenchard Hall',
    shortCode: 'TH',
    campus: 'UI',
    category: 'Administrative',
    latitude: 7.4485,
    longitude: 3.8995,
    description: 'Iconic university convocation and national symposium amphitheatre.',
    walkingTip: 'Central location right next to Senate Building and the main gate driveway.',
  },
  {
    id: 'ui-senate-building',
    name: 'University Senate Building',
    shortCode: 'SENATE',
    campus: 'UI',
    category: 'Administrative',
    latitude: 7.4478,
    longitude: 3.8992,
    description: 'Vice Chancellor secretariat, academic affairs, and student registry.',
    walkingTip: 'Directly facing the main university driveway and fountain quad.',
  },
  {
    id: 'ui-kenneth-dike-lib',
    name: 'Kenneth Dike Memorial Library',
    shortCode: 'KDL',
    campus: 'UI',
    category: 'Library',
    latitude: 7.4468,
    longitude: 3.9002,
    description: 'Premier university research library housing millions of manuscripts and e-study rooms.',
    walkingTip: '1-minute walk south of Trenchard Hall across the palm-tree avenue.',
  },
  {
    id: 'ui-sub',
    name: 'Student Union Building (SUB)',
    shortCode: 'SUB',
    campus: 'UI',
    category: 'Food & Social',
    latitude: 7.4449,
    longitude: 3.8988,
    description: 'Student governance secretariat, cafeterias, printing press, and banking desks.',
    walkingTip: 'Beside Sultan Bello Hall; central food court hub.',
  },
  {
    id: 'ui-first-bank-atm',
    name: 'First Bank & ATM Gallery (SUB)',
    shortCode: 'FBN-ATM',
    campus: 'UI',
    category: 'ATM & Bank',
    latitude: 7.4451,
    longitude: 3.8986,
    description: 'Multi-machine 24/7 ATM gallery and student banking services.',
    walkingTip: 'Adjacent to SUB car park and central student secretariat.',
  },
  {
    id: 'ui-gtbank-sub',
    name: 'GTBank Campus Branch & E-Branch',
    shortCode: 'GTB-UI',
    campus: 'UI',
    category: 'ATM & Bank',
    latitude: 7.4454,
    longitude: 3.899,
    description: 'Self-service cash deposit machines and fast student teller desk.',
    walkingTip: 'Across from the Faculty of Arts car park.',
  },
  {
    id: 'ui-faculty-tech-llt',
    name: 'Large Lecture Theatre (LLT) - Faculty of Technology',
    shortCode: 'LLT',
    campus: 'UI',
    category: 'Lecture Hall',
    latitude: 7.4498,
    longitude: 3.9042,
    description: 'Multi-tiered 800-seat lecture auditorium for engineering and computational sciences.',
    walkingTip: 'Behind faculty of Tech quad; 4-minute walk eastward from KDL.',
  },
  {
    id: 'ui-faculty-science-nlh',
    name: 'New Lecture Hall (NLH) - Science',
    shortCode: 'NLH',
    campus: 'UI',
    category: 'Lecture Hall',
    latitude: 7.4482,
    longitude: 3.9025,
    description: 'Main lecture venue for Computer Science, Physics, Chemistry and Math faculties.',
    walkingTip: 'Adjacent to Chemistry labs and the faculty botanical quad.',
  },
  {
    id: 'ui-sultan-bello',
    name: 'Sultan Bello Hall of Residence',
    shortCode: 'BELLO',
    campus: 'UI',
    category: 'Hostel',
    latitude: 7.4452,
    longitude: 3.8975,
    description: 'Historic male hall of residence founded in 1962.',
    walkingTip: 'Right opposite Queen Elizabeth Hall and a short walk to SUB.',
  },
  {
    id: 'ui-queen-idia',
    name: 'Queen Idia Hall',
    shortCode: 'IDIA',
    campus: 'UI',
    category: 'Hostel',
    latitude: 7.452,
    longitude: 3.901,
    description: 'Premier female undergraduate hostel accommodation.',
    walkingTip: 'Northern campus residential quad near the second gate.',
  },
  {
    id: 'ui-jaja-clinic',
    name: 'Jaja University Health Centre',
    shortCode: 'JAJA',
    campus: 'UI',
    category: 'Medical',
    latitude: 7.4435,
    longitude: 3.899,
    description: '24/7 University emergency and student medical health services.',
    walkingTip: 'Down the avenue past Bello Hall and Staff Club.',
  },

  // UNIVERSITY OF LAGOS (UNILAG)
  {
    id: 'unilag-senate-house',
    name: 'UNILAG Senate House',
    shortCode: 'UNILAG-SENATE',
    campus: 'UNILAG',
    category: 'Administrative',
    latitude: 6.5168,
    longitude: 3.398,
    description: '13-storey high-rise administrative headquarters of UNILAG.',
    walkingTip: 'Central focal point overlooking the lagoon front.',
  },
  {
    id: 'unilag-main-library',
    name: 'UNILAG Main Library',
    shortCode: 'UNILAG-LIB',
    campus: 'UNILAG',
    category: 'Library',
    latitude: 6.5175,
    longitude: 3.3975,
    description: 'Multi-level academic research library with digital reading labs.',
    walkingTip: 'Facing Senate House driveway; easily accessible by campus shuttle.',
  },
  {
    id: 'unilag-zenith-atm',
    name: 'Zenith Bank & ATM Hub (Access Road)',
    shortCode: 'ZENITH-UNILAG',
    campus: 'UNILAG',
    category: 'ATM & Bank',
    latitude: 6.5158,
    longitude: 3.3965,
    description: 'Multi-bank commercial strip with 24-hour illuminated ATMs.',
    walkingTip: 'On the main commercial strip opposite Faculty of Arts.',
  },
  {
    id: 'unilag-medical-centre',
    name: 'UNILAG Medical Health Centre',
    shortCode: 'MED-CENTRE',
    campus: 'UNILAG',
    category: 'Medical',
    latitude: 6.5132,
    longitude: 3.3955,
    description: 'Student medical diagnostics, outpatient clinic, and pharmacy.',
    walkingTip: 'Beside staff quarters along commercial road.',
  },
  {
    id: 'unilag-mph',
    name: 'Multipurpose Hall (MPH)',
    shortCode: 'MPH',
    campus: 'UNILAG',
    category: 'Lecture Hall',
    latitude: 6.5185,
    longitude: 3.3995,
    description: 'Major student concert, trade fair, and examination hall.',
    walkingTip: 'Next to the sports centre and indoor gymnasium.',
  },
  {
    id: 'unilag-mariere',
    name: 'Jerome Mariere Hall',
    shortCode: 'MARIERE',
    campus: 'UNILAG',
    category: 'Hostel',
    latitude: 6.514,
    longitude: 3.397,
    description: 'Central male hostel with active student sports arena.',
    walkingTip: 'Short walk to commercial bank square and shuttle park.',
  },
  {
    id: 'unilag-moremi',
    name: 'Moremi Hall of Residence',
    shortCode: 'MOREMI',
    campus: 'UNILAG',
    category: 'Hostel',
    latitude: 6.5152,
    longitude: 3.396,
    description: 'Female undergraduate hall adjacent to the lagoon botanical walk.',
    walkingTip: '2-minute stroll from the Faculty of Law building.',
  },

  // OBAFEMI AWOLOWO UNIVERSITY (OAU)
  {
    id: 'oau-oduduwa-hall',
    name: 'Oduduwa Hall & Amphitheatre',
    shortCode: 'ODUDUWA',
    campus: 'OAU',
    category: 'Lecture Hall',
    latitude: 7.5195,
    longitude: 4.5285,
    description: 'Architectural masterpiece amphitheatre for campus concerts and convocations.',
    walkingTip: 'Heart of campus quadrangle facing Hezekiah Oluwasanmi Library.',
  },
  {
    id: 'oau-hezekiah-library',
    name: 'Hezekiah Oluwasanmi Library',
    shortCode: 'HEZEKIAH',
    campus: 'OAU',
    category: 'Library',
    latitude: 7.5188,
    longitude: 4.5272,
    description: 'Legendary multi-tiered university academic and research repository.',
    walkingTip: 'Center of central university walkway opposite the Senate Building.',
  },
  {
    id: 'oau-health-centre',
    name: 'OAU Student Health Centre',
    shortCode: 'OAU-HEALTH',
    campus: 'OAU',
    category: 'Medical',
    latitude: 7.515,
    longitude: 4.526,
    description: 'University hospital and 24/7 student pharmacy and clinical care.',
    walkingTip: 'Located near Road 1 and the sports complex.',
  },

  // COVENANT UNIVERSITY (CU)
  {
    id: 'cu-cst-hall',
    name: 'College of Science & Technology (CST)',
    shortCode: 'CU-CST',
    campus: 'CU',
    category: 'Lecture Hall',
    latitude: 6.673,
    longitude: 3.1625,
    description: 'Computer Science, Electrical Engineering and Computational Labs.',
    walkingTip: 'Facing the campus central quadrangle and e-learning centre.',
  },
  {
    id: 'cu-clr-library',
    name: 'Centre for Learning Resources (CLR)',
    shortCode: 'CU-CLR',
    campus: 'CU',
    category: 'Library',
    latitude: 6.6715,
    longitude: 3.1605,
    description: 'Ultra-modern 3-storey digital library with automated study cubicles.',
    walkingTip: 'Adjacent to Senate Building and Chapel.',
  },
];

/**
 * Calculates straight-line distance in meters between two geocoordinates using the Haversine formula.
 */
export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Formats distance in meters into human-readable metric and walking ETA (80 meters/min).
 */
export function formatDistanceAndEta(meters: number): { distanceText: string; etaText: string } {
  const distanceText = meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
  const minutes = Math.max(1, Math.round(meters / 80));
  const etaText = minutes === 1 ? '1 min walk' : `${minutes} min walk`;
  return { distanceText, etaText };
}

/**
 * Queries OpenStreetMap (Overpass) for live amenities (ATMs, food, health, study areas) around a campus.
 *
 * The request goes through the `overpass-proxy` Supabase edge function: overpass-api.de answers any
 * browser User-Agent with a 406 that has no CORS headers, so a direct browser call can never succeed.
 * Results are cached per campus for 30 minutes because the upstream is slow (10-20s).
 */
const OVERPASS_PROXY_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://fdtnbluslkabwsmspbem.supabase.co'}/functions/v1/overpass-proxy`;
const OVERPASS_PROXY_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_TB0Pw8k2oJQTmoO951YaIQ_xzOyGpZF';
const OVERPASS_CACHE_TTL_MS = 30 * 60 * 1000;
const overpassCache = new Map<string, { at: number; data: any }>();

export async function fetchOverpassCampusAmenities(
  campusCode: string,
  userLat?: number,
  userLon?: number
): Promise<CampusLandmark[]> {
  const normalizedCampus = (campusCode || 'UI').toUpperCase();
  const center = CAMPUS_CENTERS[normalizedCampus] || CAMPUS_CENTERS.UI;
  const centerLat = center.latitude;
  const centerLon = center.longitude;

  try {
    let data: any = null;
    const cached = overpassCache.get(normalizedCampus);
    if (cached && Date.now() - cached.at < OVERPASS_CACHE_TTL_MS) {
      data = cached.data;
    } else {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45000);
      try {
        const res = await fetch(OVERPASS_PROXY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: OVERPASS_PROXY_KEY },
          body: JSON.stringify({ lat: centerLat, lon: centerLon }),
          signal: controller.signal,
        });
        if (res.ok) {
          data = await res.json();
          overpassCache.set(normalizedCampus, { at: Date.now(), data });
        }
      } finally {
        clearTimeout(timer);
      }
    }

    if (data) {
      const elements: any[] = data.elements || [];

      const liveLandmarks = elements
        .filter((el: any) => el.tags && (el.tags.name || el.tags.amenity || el.tags.operator))
        .map((el: any) => {
          const lat = el.lat || el.center?.lat || centerLat;
          const lon = el.lon || el.center?.lon || centerLon;
          const amenity = el.tags.amenity || '';
          const name = el.tags.name || el.tags.operator || `${amenity.toUpperCase()} Point`;

          let category: CampusLandmark['category'] = 'Administrative';
          if (amenity === 'atm' || amenity === 'bank') category = 'ATM & Bank';
          else if (amenity === 'clinic' || amenity === 'pharmacy' || amenity === 'hospital') category = 'Medical';
          else if (amenity === 'cafe' || amenity === 'restaurant' || amenity === 'fast_food') category = 'Food & Social';
          else if (amenity === 'library') category = 'Library';
          else if (el.tags.building === 'university' || el.tags.building === 'college') category = 'Lecture Hall';

          const dist = calculateDistanceMeters(
            userLat || centerLat,
            userLon || centerLon,
            lat,
            lon
          );

          return {
            id: `osm-${el.id}`,
            name,
            campus: normalizedCampus,
            category,
            latitude: lat,
            longitude: lon,
            description: el.tags['description'] || el.tags['addr:street'] || `Verified OpenStreetMap ${category} on campus.`,
            walkingTip: el.tags['opening_hours'] ? `Hours: ${el.tags['opening_hours']}` : 'Open to campus community',
            amenityType: amenity,
            isOsmLive: true,
            distanceMeters: dist,
          };
        });

      if (liveLandmarks.length > 0) {
        const local = getCampusLandmarks(normalizedCampus);
        const combined = [...liveLandmarks, ...local];
        const seen = new Set<string>();
        return combined.filter((item: CampusLandmark) => {
          const key = item.name.toLowerCase().trim();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
    }
  } catch (err) {
    console.warn('[Overpass OSM] API fetch failed, falling back to local campus catalog:', err);
  }

  return getCampusLandmarks(normalizedCampus);
}

export function getCampusLandmarks(campusFilter?: string | null): CampusLandmark[] {
  if (!campusFilter) return CAMPUS_LANDMARKS;
  const upper = campusFilter.toUpperCase();
  const matched = CAMPUS_LANDMARKS.filter(
    (l) => l.campus.toUpperCase() === upper || upper.includes(l.campus.toUpperCase())
  );
  return matched.length > 0 ? matched : CAMPUS_LANDMARKS;
}

export function searchLandmarks(
  query: string,
  campus?: string | null,
  customList?: CampusLandmark[]
): CampusLandmark[] {
  const landmarks = customList || getCampusLandmarks(campus);
  const q = query.toLowerCase().trim();
  if (!q) return landmarks;
  return landmarks.filter(
    (l) =>
      l.name.toLowerCase().includes(q) ||
      (l.shortCode && l.shortCode.toLowerCase().includes(q)) ||
      l.category.toLowerCase().includes(q) ||
      l.description.toLowerCase().includes(q)
  );
}

export function getOsmEmbedUrl(lat: number, lon: number, zoom: number = 17): string {
  const delta = 0.003;
  const minLon = lon - delta;
  const minLat = lat - delta;
  const maxLon = lon + delta;
  const maxLat = lat + delta;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${minLon}%2C${minLat}%2C${maxLon}%2C${maxLat}&layer=mapnik&marker=${lat}%2C${lon}`;
}

export function getDirectionsUrl(toLat: number, toLon: number, name?: string): string {
  const label = name ? encodeURIComponent(name) : 'Destination';
  return `https://www.google.com/maps/dir/?api=1&destination=${toLat},${toLon}&destination_place_id=${label}`;
}
