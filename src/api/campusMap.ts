/**
 * Interactive Campus Map & Hall Locator API
 * Geocoded landmarks, faculty halls, libraries, and hostels for major Nigerian universities.
 * OpenStreetMap tile integration and live walking directions.
 */

export interface CampusLandmark {
  id: string;
  name: string;
  shortCode?: string;
  campus: string;
  category: 'Lecture Hall' | 'Library' | 'Administrative' | 'Hostel' | 'Medical' | 'Food & Social' | 'Sports';
  latitude: number;
  longitude: number;
  description: string;
  walkingTip?: string;
}

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
];

export function getCampusLandmarks(campusFilter?: string | null): CampusLandmark[] {
  if (!campusFilter) return CAMPUS_LANDMARKS;
  const upper = campusFilter.toUpperCase();
  const matched = CAMPUS_LANDMARKS.filter(
    (l) => l.campus.toUpperCase() === upper || upper.includes(l.campus.toUpperCase())
  );
  return matched.length > 0 ? matched : CAMPUS_LANDMARKS;
}

export function searchLandmarks(query: string, campus?: string | null): CampusLandmark[] {
  const landmarks = getCampusLandmarks(campus);
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
