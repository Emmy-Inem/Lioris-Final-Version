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
  // FEDERAL UNIVERSITY OF AGRICULTURE, ABEOKUTA (FUNAAB)
  {
    id: 'funaab-senate-building',
    name: "Senate Building & Vice-Chancellor's Secretariat",
    shortCode: 'SENATE',
    campus: 'FUNAAB',
    category: 'Administrative',
    latitude: 7.2255,
    longitude: 3.4435,
    description: "Central administrative headquarters housing the Vice-Chancellor's office, Directorate of Academic Affairs, and Student Registry.",
    walkingTip: 'Central focal point overlooking Motion Ground and the main university dual carriage driveway.',
  },
  {
    id: 'funaab-nimbe-adedipe-lib',
    name: "'Nimbe Adedipe Memorial Central Library",
    shortCode: 'LIBRARY',
    campus: 'FUNAAB',
    category: 'Library',
    latitude: 7.2248,
    longitude: 3.4442,
    description: 'Ultra-modern university research library with multi-floor study reading halls, digital e-learning labs, and postgraduate research rooms.',
    walkingTip: 'Facing Motion Ground directly; 1-minute walk from the Senate building.',
  },
  {
    id: 'funaab-mylt',
    name: 'Mahmood Yakubu Lecture Theatre (MYLT)',
    shortCode: 'MYLT',
    campus: 'FUNAAB',
    category: 'Lecture Hall',
    latitude: 7.2262,
    longitude: 3.4428,
    description: 'Iconic 1,500-seat multi-tiered central lecture auditorium for major general university courses, exams, and national symposiums.',
    walkingTip: 'Immediately behind the Senate building; primary venue for 100L and 200L foundational lectures.',
  },
  {
    id: 'funaab-coleng',
    name: 'COLENG (College of Engineering) Complex',
    shortCode: 'COLENG',
    campus: 'FUNAAB',
    category: 'Lecture Hall',
    latitude: 7.2285,
    longitude: 3.4412,
    description: 'Engineering workshops, CAD studios, Civil, Mechanical, Mechatronics, and Electrical Engineering amphitheaters.',
    walkingTip: 'North academic sector along the engineering ring road, past the ICT Centre.',
  },
  {
    id: 'funaab-colphys',
    name: 'COLPHYS (College of Physical Sciences) Complex',
    shortCode: 'COLPHYS',
    campus: 'FUNAAB',
    category: 'Lecture Hall',
    latitude: 7.2268,
    longitude: 3.4455,
    description: 'Computer Science software labs, Mathematics lecture rooms, Physics research chambers, and Chemistry demonstration auditoriums.',
    walkingTip: 'East of Motion Ground; connected via the paved central walkway corridor.',
  },
  {
    id: 'funaab-colbios',
    name: 'COLBIOS (College of Biological Sciences) Complex',
    shortCode: 'COLBIOS',
    campus: 'FUNAAB',
    category: 'Lecture Hall',
    latitude: 7.2275,
    longitude: 3.4468,
    description: 'Microbiology laboratories, Biochemistry research halls, Botany herbarium, and Zoology dissection rooms.',
    walkingTip: 'Adjacent to COLPHYS along the northern science avenue.',
  },
  {
    id: 'funaab-colamrud',
    name: 'COLAMRUD Lecture Complex & Deanery',
    shortCode: 'COLAMRUD',
    campus: 'FUNAAB',
    category: 'Lecture Hall',
    latitude: 7.2238,
    longitude: 3.4425,
    description: 'College of Agricultural Management, Rural Development, and Agricultural Economics classrooms.',
    walkingTip: 'South of the Senate building, near the practical farming pavilions.',
  },
  {
    id: 'funaab-colfhec',
    name: 'COLFHEC (Food Science & Human Ecology) Complex',
    shortCode: 'COLFHEC',
    campus: 'FUNAAB',
    category: 'Lecture Hall',
    latitude: 7.2242,
    longitude: 3.4462,
    description: 'Food processing pilot plant, sensory evaluation labs, nutrition studios, and hospitality demonstration kitchens.',
    walkingTip: 'Directly across from the central library gardens.',
  },
  {
    id: 'funaab-colplant-anim',
    name: 'COLPLANT & COLANIM Agricultural Complex',
    shortCode: 'COLPLANT',
    campus: 'FUNAAB',
    category: 'Lecture Hall',
    latitude: 7.2225,
    longitude: 3.4415,
    description: 'Colleges of Plant Science and Animal Production & Health lecture theatres and agronomy research labs.',
    walkingTip: 'Southwestern campus sector leading toward the Directorate of University Farms (DUFARMS).',
  },
  {
    id: 'funaab-colvet',
    name: 'COLVET (College of Veterinary Medicine) & Teaching Hospital',
    shortCode: 'COLVET',
    campus: 'FUNAAB',
    category: 'Lecture Hall',
    latitude: 7.2215,
    longitude: 3.4398,
    description: 'Veterinary medicine lecture theatres, pathology suites, surgical wards, and clinical diagnosis complexes.',
    walkingTip: 'West wing of campus near the Veterinary Teaching Hospital entrance.',
  },
  {
    id: 'funaab-ceremonial-building',
    name: 'Ceremonial Building & Convocation Arena',
    shortCode: 'CONVO',
    campus: 'FUNAAB',
    category: 'Administrative',
    latitude: 7.2250,
    longitude: 3.4420,
    description: 'Grand 3,500-seat amphitheatre for university convocations, matriculations, and international conferences.',
    walkingTip: 'West of the Senate building facing the ceremonial parade grounds.',
  },
  {
    id: 'funaab-ict-centre',
    name: 'INPIRPU / ICT Resource Centre & CBT Hall',
    shortCode: 'ICT-CBT',
    campus: 'FUNAAB',
    category: 'Administrative',
    latitude: 7.2260,
    longitude: 3.4445,
    description: 'Central university ICT infrastructure, student e-testing centres, and high-speed campus broadband hub.',
    walkingTip: 'North of Motion Ground between the Senate building and COLENG avenue.',
  },
  {
    id: 'funaab-health-centre',
    name: 'FUNAAB University Health Centre',
    shortCode: 'HEALTH',
    campus: 'FUNAAB',
    category: 'Medical',
    latitude: 7.2232,
    longitude: 3.4448,
    description: '24/7 University emergency clinic, pharmacy, observation wards, and clinical laboratory for students and staff.',
    walkingTip: 'South of the central library; 24-hour emergency ambulance service stationed outside.',
  },
  {
    id: 'funaab-zenith-bank',
    name: 'Zenith Bank & 24/7 ATM Hub (Campus Branch)',
    shortCode: 'ZENITH-ATM',
    campus: 'FUNAAB',
    category: 'ATM & Bank',
    latitude: 7.2245,
    longitude: 3.4452,
    description: 'Full-service commercial bank branch with 4 multi-network ATMs and student financial support desks.',
    walkingTip: 'Commercial bank strip adjacent to the University Health Centre.',
  },
  {
    id: 'funaab-access-bank',
    name: 'Access Bank & E-Branch',
    shortCode: 'ACCESS-ATM',
    campus: 'FUNAAB',
    category: 'ATM & Bank',
    latitude: 7.2243,
    longitude: 3.4450,
    description: 'Commercial banking branch, instant debit card dispensation, and cash deposit ATMs.',
    walkingTip: 'Located along the commercial banking arcade opposite the Health Centre.',
  },
  {
    id: 'funaab-gtbank',
    name: 'GTBank E-Branch & Cash Desks',
    shortCode: 'GTB-ATM',
    campus: 'FUNAAB',
    category: 'ATM & Bank',
    latitude: 7.2247,
    longitude: 3.4449,
    description: 'Self-service digital banking hub and 24-hour illuminated cash dispenser kiosks.',
    walkingTip: 'Next to Zenith Bank on the commercial banking strip.',
  },
  {
    id: 'funaab-sug-secretariat',
    name: 'Student Union Government (SUG) Secretariat & Food Court',
    shortCode: 'SUG',
    campus: 'FUNAAB',
    category: 'Food & Social',
    latitude: 7.2252,
    longitude: 3.4440,
    description: 'Vibrant student union hub, executive council chambers, multi-vendor food canteen, and printing services.',
    walkingTip: 'Directly on Motion Ground; popular student convergence point between lectures.',
  },
  {
    id: 'funaab-motion-ground',
    name: 'Motion Ground (Central Quadrangle)',
    shortCode: 'MOTION',
    campus: 'FUNAAB',
    category: 'Food & Social',
    latitude: 7.2254,
    longitude: 3.4430,
    description: 'The beating heart of student campus life, social gatherings, career fairs, and open-air discussions.',
    walkingTip: 'The main paved lawn bounded by the Senate Building, Library, and SUG building.',
  },
  {
    id: 'funaab-sports-complex',
    name: 'FUNAAB Sports Complex & Stadium',
    shortCode: 'STADIUM',
    campus: 'FUNAAB',
    category: 'Sports',
    latitude: 7.2272,
    longitude: 3.4390,
    description: 'Main football pitch, synthetic athletics track, basketball courts, volleyball, and tennis arena.',
    walkingTip: 'West campus avenue, past the Ceremonial Building.',
  },
  {
    id: 'funaab-tinubu-hostel',
    name: 'Iyalode Tinubu Hall of Residence',
    shortCode: 'TINUBU',
    campus: 'FUNAAB',
    category: 'Hostel',
    latitude: 7.2290,
    longitude: 3.4475,
    description: 'Major female undergraduate hall of residence with internal study rooms and cafeteria.',
    walkingTip: 'North-eastern residential sector; serviced by the internal shuttle bus.',
  },
  {
    id: 'funaab-babatunde-hostel',
    name: 'Professor Babatunde Male Hostel',
    shortCode: 'BABATUNDE',
    campus: 'FUNAAB',
    category: 'Hostel',
    latitude: 7.2298,
    longitude: 3.4465,
    description: 'Undergraduate male hall of residence with recreational common rooms and sports court.',
    walkingTip: 'Residential quadrangle adjacent to Iyalode Tinubu Hall.',
  },
  {
    id: 'funaab-pg-hostel',
    name: 'Postgraduate Hall of Residence',
    shortCode: 'PG-HALL',
    campus: 'FUNAAB',
    category: 'Hostel',
    latitude: 7.2305,
    longitude: 3.4480,
    description: 'En-suite study accommodations for Master and PhD research scholars.',
    walkingTip: 'Northern boundary of the student residential sector.',
  },
  {
    id: 'funaab-main-gate',
    name: 'FUNAAB Ceremonial Gate & Shuttle Park',
    shortCode: 'MAIN-GATE',
    campus: 'FUNAAB',
    category: 'Administrative',
    latitude: 7.2185,
    longitude: 3.4350,
    description: 'University main security checkpoint, visitor registration, and campus green-and-white shuttle hub.',
    walkingTip: 'Main entrance off Alabata Road; starting point for all campus shuttle transit.',
  },
  {
    id: 'funaab-zoo-park',
    name: 'FUNAAB Zoological Garden & Eco-Park',
    shortCode: 'ZOO',
    campus: 'FUNAAB',
    category: 'Food & Social',
    latitude: 7.2195,
    longitude: 3.4380,
    description: 'Conservation park, animal reserve, botanical relaxation area, and picnic grounds.',
    walkingTip: 'Along the driveway between the Main Gate and the central campus quad.',
  },

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
  {
    id: 'ui-sports-complex',
    name: 'Awo Stadium & UI Sports Centre',
    shortCode: 'UI-STADIUM',
    campus: 'UI',
    category: 'Sports',
    latitude: 7.4460,
    longitude: 3.8945,
    description: 'Main athletics stadium, swimming pool, basketball and tennis pavilion.',
    walkingTip: 'West of Obafemi Awolowo Hall.',
  },
  {
    id: 'ui-faculty-arts',
    name: 'Faculty of Arts Complex',
    shortCode: 'ARTS',
    campus: 'UI',
    category: 'Lecture Hall',
    latitude: 7.4460,
    longitude: 3.8998,
    description: 'Linguistics, English, History, and Philosophy lecture theatres and seminar rooms.',
    walkingTip: 'Across from Kenneth Dike Library.',
  },
  {
    id: 'ui-tedder-hall',
    name: 'Lord Tedder Hall',
    shortCode: 'TEDDER',
    campus: 'UI',
    category: 'Hostel',
    latitude: 7.4470,
    longitude: 3.8980,
    description: 'Historic undergraduate male hall of residence.',
    walkingTip: 'Beside Mellanby Hall and directly opposite Trenchard Hall.',
  },
  {
    id: 'ui-main-gate',
    name: 'UI Ceremonial Main Gate',
    shortCode: 'MAIN-GATE',
    campus: 'UI',
    category: 'Administrative',
    latitude: 7.4420,
    longitude: 3.9010,
    description: 'Main campus security entrance along Oyo Road, bus terminal, and visitors lodge.',
    walkingTip: 'Primary access point into university grounds.',
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
  {
    id: 'unilag-lagoon-front',
    name: 'UNILAG Lagoon Front Park',
    shortCode: 'LAGOON',
    campus: 'UNILAG',
    category: 'Food & Social',
    latitude: 6.5180,
    longitude: 3.4010,
    description: 'Scenic waterfront park, relaxation lawns, and open-air student study hub.',
    walkingTip: 'Directly behind Senate House overlooking the Lagos Lagoon.',
  },
  {
    id: 'unilag-sports-centre',
    name: 'UNILAG Sports Centre & Indoor Hall',
    shortCode: 'SPORTS',
    campus: 'UNILAG',
    category: 'Sports',
    latitude: 6.5190,
    longitude: 3.3985,
    description: 'Olympic swimming pool, running track, football stadium, and basketball courts.',
    walkingTip: 'Beside the Multipurpose Hall.',
  },
  {
    id: 'unilag-faculty-engineering',
    name: 'Faculty of Engineering Complex',
    shortCode: 'ENG',
    campus: 'UNILAG',
    category: 'Lecture Hall',
    latitude: 6.5160,
    longitude: 3.3940,
    description: 'Chemical, Civil, Computer, and Electrical engineering departments and laboratories.',
    walkingTip: 'Along commercial avenue heading west from Senate House.',
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
    id: 'oau-senate-building',
    name: 'OAU Senate Building',
    shortCode: 'SENATE',
    campus: 'OAU',
    category: 'Administrative',
    latitude: 7.5190,
    longitude: 4.5280,
    description: 'Central administrative skyscraper housing the Vice-Chancellor secretariat.',
    walkingTip: 'Towering landmark in the central campus quadrangle.',
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
  {
    id: 'oau-angola-hall',
    name: 'Angola Hall of Residence',
    shortCode: 'ANGOLA',
    campus: 'OAU',
    category: 'Hostel',
    latitude: 7.5220,
    longitude: 4.5310,
    description: 'Freshman male hall of residence with vibrant community life.',
    walkingTip: 'Adjacent to Mozambique Hall.',
  },
  {
    id: 'oau-mozambique-hall',
    name: 'Mozambique Hall of Residence',
    shortCode: 'MOZ',
    campus: 'OAU',
    category: 'Hostel',
    latitude: 7.5215,
    longitude: 4.5320,
    description: 'Freshman female hall of residence.',
    walkingTip: 'Behind the Student Union Building.',
  },
  {
    id: 'oau-sub',
    name: 'OAU Student Union Building (Ken Saro-Wiwa Block)',
    shortCode: 'SUB',
    campus: 'OAU',
    category: 'Food & Social',
    latitude: 7.5200,
    longitude: 4.5290,
    description: 'SUG chambers, student canteen arcade, bookshops, and social terrace.',
    walkingTip: 'Short walk east of Oduduwa Hall.',
  },
  {
    id: 'oau-banking-hall',
    name: 'OAU Central Banking Strip & ATMs',
    shortCode: 'BANKS',
    campus: 'OAU',
    category: 'ATM & Bank',
    latitude: 7.5175,
    longitude: 4.5265,
    description: 'Commercial banking branches including Wema, First Bank, and GTBank.',
    walkingTip: 'Along the main avenue toward the campus gate.',
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
  {
    id: 'cu-senate-building',
    name: 'Covenant University Senate Building',
    shortCode: 'SENATE',
    campus: 'CU',
    category: 'Administrative',
    latitude: 6.6720,
    longitude: 3.1610,
    description: 'Administrative offices, Registrar, and Academic Planning Directorate.',
    walkingTip: 'Central axis of the Canaanland campus.',
  },
  {
    id: 'cu-health-centre',
    name: 'Covenant University Medical Centre',
    shortCode: 'HEALTH',
    campus: 'CU',
    category: 'Medical',
    latitude: 6.6705,
    longitude: 3.1595,
    description: 'Round-the-clock student and staff hospital with on-site pharmacy.',
    walkingTip: 'South of the residential halls.',
  },
  {
    id: 'cu-cafeteria-1',
    name: 'Student Cafeteria & Buttery 1',
    shortCode: 'CAFE',
    campus: 'CU',
    category: 'Food & Social',
    latitude: 6.6725,
    longitude: 3.1630,
    description: 'Main student dining hall, fruit market, and stationery shops.',
    walkingTip: 'Conveniently situated between male and female halls.',
  },
  {
    id: 'cu-stadium',
    name: 'Covenant Sports Complex',
    shortCode: 'STADIUM',
    campus: 'CU',
    category: 'Sports',
    latitude: 6.6740,
    longitude: 3.1640,
    description: 'Standard soccer stadium, basketball courts, and tartan track.',
    walkingTip: 'Behind the College of Engineering.',
  },

  // UNIVERSITY OF NIGERIA, NSUKKA (UNN)
  {
    id: 'unn-nnamdi-azikiwe-lib',
    name: 'Nnamdi Azikiwe Central Library',
    shortCode: 'UNN-LIB',
    campus: 'UNN',
    category: 'Library',
    latitude: 6.8675,
    longitude: 7.4115,
    description: 'One of the largest university research libraries in West Africa.',
    walkingTip: 'Heart of campus facing Freedom Square.',
  },
  {
    id: 'unn-senate-building',
    name: 'UNN Senate Building',
    shortCode: 'SENATE',
    campus: 'UNN',
    category: 'Administrative',
    latitude: 6.8665,
    longitude: 7.4105,
    description: 'Vice-Chancellor secretariat, Council Chambers, and Registry.',
    walkingTip: 'Opposite Freedom Square.',
  },
  {
    id: 'unn-medical-centre',
    name: 'UNN University Health Services',
    shortCode: 'HEALTH',
    campus: 'UNN',
    category: 'Medical',
    latitude: 6.8650,
    longitude: 7.4090,
    description: '24-hour emergency medical care, maternity, and pharmacy.',
    walkingTip: 'Along Franco avenue.',
  },
  {
    id: 'unn-sub',
    name: 'UNN Student Union Building & Franco Refectory',
    shortCode: 'SUB',
    campus: 'UNN',
    category: 'Food & Social',
    latitude: 6.8680,
    longitude: 7.4125,
    description: 'Student activities center, dining halls, and student council chambers.',
    walkingTip: 'East of the main quadrangle.',
  },

  // FEDERAL UNIVERSITY OF TECHNOLOGY, AKURE (FUTA)
  {
    id: 'futa-albert-ihemba-lib',
    name: 'Albert Ilemobade Central Library',
    shortCode: 'FUTA-LIB',
    campus: 'FUTA',
    category: 'Library',
    latitude: 7.3050,
    longitude: 5.1390,
    description: 'State-of-the-art technological library and e-learning hub.',
    walkingTip: 'Main campus avenue facing Senate Building.',
  },
  {
    id: 'futa-senate-building',
    name: 'FUTA Senate Building',
    shortCode: 'SENATE',
    campus: 'FUTA',
    category: 'Administrative',
    latitude: 7.3045,
    longitude: 5.1384,
    description: 'Administrative tower, Academic Affairs, and Bursary.',
    walkingTip: 'Central axis of the Obanla campus.',
  },
  {
    id: 'futa-seet-complex',
    name: 'School of Engineering & Engineering Tech (SEET)',
    shortCode: 'SEET',
    campus: 'FUTA',
    category: 'Lecture Hall',
    latitude: 7.3060,
    longitude: 5.1405,
    description: 'Engineering lecture halls, workshops, and computer laboratory.',
    walkingTip: 'Behind the library along SEET road.',
  },
  {
    id: 'futa-health-centre',
    name: 'FUTA Health Centre',
    shortCode: 'HEALTH',
    campus: 'FUTA',
    category: 'Medical',
    latitude: 7.3030,
    longitude: 5.1370,
    description: 'Student medical diagnostics, outpatient clinic, and emergency service.',
    walkingTip: 'Near the campus second gate.',
  },

  // AHMADU BELLO UNIVERSITY (ABU)
  {
    id: 'abu-kashim-ibrahim-lib',
    name: 'Kashim Ibrahim Library',
    shortCode: 'KIL',
    campus: 'ABU',
    category: 'Library',
    latitude: 11.1565,
    longitude: 7.6505,
    description: 'Premier Northern university academic research repository.',
    walkingTip: 'Central Samaru campus opposite Senate Building.',
  },
  {
    id: 'abu-senate-building',
    name: 'ABU Senate Building',
    shortCode: 'SENATE',
    campus: 'ABU',
    category: 'Administrative',
    latitude: 11.1558,
    longitude: 7.6497,
    description: 'Administrative headquarters of Ahmadu Bello University.',
    walkingTip: 'Heart of Samaru campus.',
  },
  {
    id: 'abu-assembly-hall',
    name: 'ABU Assembly Hall',
    shortCode: 'ASSEMBLY',
    campus: 'ABU',
    category: 'Lecture Hall',
    latitude: 11.1570,
    longitude: 7.6515,
    description: 'Historic matriculation, convocation, and student examination amphitheatre.',
    walkingTip: 'Beside Kashim Ibrahim Library.',
  },
  {
    id: 'abu-university-health-centre',
    name: 'ABU University Health Services (Sick Bay)',
    shortCode: 'HEALTH',
    campus: 'ABU',
    category: 'Medical',
    latitude: 11.1540,
    longitude: 7.6480,
    description: '24/7 University health center and clinical pharmacy.',
    walkingTip: 'Located along Suleiman Hall road.',
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
  const normalizedCampus = (campusCode && campusCode !== 'GLOBAL' ? campusCode : 'UNILAG').toUpperCase();
  const center = CAMPUS_CENTERS[normalizedCampus] || CAMPUS_CENTERS.UNILAG || CAMPUS_CENTERS.UI;
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
        const combined = [...local, ...liveLandmarks];
        const seen = new Set<string>();
        return combined.filter((item: CampusLandmark) => {
          if (item.campus.toUpperCase() !== normalizedCampus) return false;
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
  if (!campusFilter || campusFilter.toUpperCase() === 'GLOBAL') return CAMPUS_LANDMARKS;
  const upper = campusFilter.toUpperCase();
  return CAMPUS_LANDMARKS.filter((l) => l.campus.toUpperCase() === upper);
}

export function searchLandmarks(
  query: string,
  campus?: string | null,
  customList?: CampusLandmark[]
): CampusLandmark[] {
  const campusUpper = (campus && campus.toUpperCase() !== 'GLOBAL') ? campus.toUpperCase() : null;
  const base = customList || getCampusLandmarks(campusUpper);
  const scoped = campusUpper ? base.filter((l) => l.campus.toUpperCase() === campusUpper) : base;
  const q = query.toLowerCase().trim();
  if (!q) return scoped;
  return scoped.filter(
    (l) =>
      l.name.toLowerCase().includes(q) ||
      (l.shortCode && l.shortCode.toLowerCase().includes(q)) ||
      l.category.toLowerCase().includes(q) ||
      l.description.toLowerCase().includes(q) ||
      (l.walkingTip && l.walkingTip.toLowerCase().includes(q))
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
