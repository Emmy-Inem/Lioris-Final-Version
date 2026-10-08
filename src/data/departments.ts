/**
 * Single source of truth for campus-specific academic structures, colleges, faculties, and departments.
 *
 * Supports:
 * - FUNAAB: 10 Colleges (COLPHYS, COLBIOS, COLENG, COLAMR, COLPLANT, COLANIM, COLFHEC, COLERM, COLVET, COLMAS)
 * - UI: 12+ Faculties (Arts, Science, Technology, Social Sciences, Agriculture, Renewable Natural Resources, Law, Education, Economics & Management Sciences, College of Medicine, Veterinary Medicine, Environmental Design)
 * - UNILAG: 10+ Faculties & Colleges (Arts, Science, Engineering, Social Sciences, Management Sciences, Law, Environmental Sciences, Education, CMUL, Pharmacy)
 * - UNN, OAU, CU, and GLOBAL: Respective colleges/faculties and full department rosters.
 */

export interface FacultyGroup {
  faculty: string;
  code?: string;
  departments: string[];
}

export interface AcademicStructure {
  campusCode: string;
  groupType: 'College' | 'Faculty';
  groups: FacultyGroup[];
}

// ---------------------------------------------------------------------------
// FUNAAB: Federal University of Agriculture, Abeokuta (Colleges)
// ---------------------------------------------------------------------------
export const FUNAAB_STRUCTURE: AcademicStructure = {
  campusCode: 'FUNAAB',
  groupType: 'College',
  groups: [
    {
      faculty: 'College of Computer Sciences (COCS)',
      code: 'COCS',
      departments: [
        'Software Engineering',
        'Computer Science',
        'Cyber Security',
        'Information Technology',
        'Data Science',
        'Information Systems',
      ],
    },
    {
      faculty: 'College of Physical Sciences (COLPHYS)',
      code: 'COLPHYS',
      departments: [
        'Computer Science',
        'Software Engineering',
        'Cyber Security',
        'Mathematics',
        'Statistics',
        'Physics',
        'Chemistry',
      ],
    },
    {
      faculty: 'College of Biological Sciences (COLBIOS)',
      code: 'COLBIOS',
      departments: [
        'Biochemistry',
        'Microbiology',
        'Pure and Applied Botany',
        'Pure and Applied Zoology',
      ],
    },
    {
      faculty: 'College of Engineering (COLENG)',
      code: 'COLENG',
      departments: [
        'Agricultural and Bio-Resources Engineering',
        'Civil Engineering',
        'Electrical and Electronics Engineering',
        'Mechanical Engineering',
        'Mechatronics Engineering',
      ],
    },
    {
      faculty: 'College of Plant Science & Crop Production (COLPLANT)',
      code: 'COLPLANT',
      departments: [
        'Crop Protection',
        'Horticulture',
        'Plant Breeding and Seed Technology',
        'Plant Physiology and Crop Production',
        'Soil Science and Land Management',
      ],
    },
    {
      faculty: 'College of Animal Science & Livestock Production (COLANIM)',
      code: 'COLANIM',
      departments: [
        'Animal Breeding and Genetics',
        'Animal Nutrition',
        'Animal Physiology',
        'Animal Production and Health',
        'Pasture and Range Management',
      ],
    },
    {
      faculty: 'College of Agricultural Management & Rural Development (COLAMR)',
      code: 'COLAMR',
      departments: [
        'Agricultural Economics and Farm Management',
        'Agricultural Extension and Rural Development',
        'Agricultural Administration',
        'Communication and General Studies',
      ],
    },
    {
      faculty: 'College of Food Science & Human Ecology (COLFHEC)',
      code: 'COLFHEC',
      departments: [
        'Food Science and Technology',
        'Home Science and Management',
        'Hospitality and Tourism',
        'Nutrition and Dietetics',
      ],
    },
    {
      faculty: 'College of Environmental Resources Management (COLERM)',
      code: 'COLERM',
      departments: [
        'Aquaculture and Fisheries Management',
        'Environmental Management and Toxicology',
        'Forestry and Wildlife Management',
        'Water Resources Management and Agrometeorology',
      ],
    },
    {
      faculty: 'College of Veterinary Medicine (COLVET)',
      code: 'COLVET',
      departments: [
        'Veterinary Anatomy',
        'Veterinary Medicine',
        'Veterinary Microbiology & Parasitology',
        'Veterinary Pathology',
        'Veterinary Physiology & Pharmacology',
        'Veterinary Public Health & Reproduction',
        'Veterinary Surgery & Theriogenology',
      ],
    },
    {
      faculty: 'College of Management Sciences (COLMAS)',
      code: 'COLMAS',
      departments: [
        'Accounting',
        'Banking and Finance',
        'Business Administration',
        'Economics',
        'Entrepreneurship',
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// UI: University of Ibadan (Faculties & College of Medicine)
// ---------------------------------------------------------------------------
export const UI_STRUCTURE: AcademicStructure = {
  campusCode: 'UI',
  groupType: 'Faculty',
  groups: [
    {
      faculty: 'Faculty of Science',
      code: 'FOS',
      departments: [
        'Computer Science',
        'Mathematics',
        'Statistics',
        'Physics',
        'Chemistry',
        'Microbiology',
        'Botany',
        'Zoology',
        'Geology',
        'Archaeology & Anthropology',
      ],
    },
    {
      faculty: 'Faculty of Technology',
      code: 'TECH',
      departments: [
        'Agricultural & Environmental Engineering',
        'Civil Engineering',
        'Electrical & Electronic Engineering',
        'Mechanical Engineering',
        'Petroleum Engineering',
        'Industrial & Production Engineering',
        'Food Technology',
        'Wood Products Engineering',
        'Biomedical Engineering',
      ],
    },
    {
      faculty: 'Faculty of Arts',
      code: 'ARTS',
      departments: [
        'English',
        'History',
        'Philosophy',
        'Classics',
        'Religious Studies',
        'Linguistics & African Languages',
        'Communication & Language Arts',
        'Theatre Arts',
        'Music',
        'European Studies',
        'Arabic & Islamic Studies',
      ],
    },
    {
      faculty: 'Faculty of the Social Sciences',
      code: 'SOCSCI',
      departments: [
        'Economics',
        'Political Science',
        'Sociology',
        'Psychology',
        'Geography',
      ],
    },
    {
      faculty: 'Faculty of Economics & Management Sciences',
      code: 'EMS',
      departments: [
        'Accounting',
        'Banking & Finance',
        'Business Administration',
        'Marketing',
      ],
    },
    {
      faculty: 'Faculty of Law',
      code: 'LAW',
      departments: [
        'Public Law',
        'Private & Property Law',
        'Commercial & Industrial Law',
        'Jurisprudence & International Law',
      ],
    },
    {
      faculty: 'College of Medicine',
      code: 'COM',
      departments: [
        'Medicine & Surgery (MBBS)',
        'Dentistry (BDS)',
        'Nursing Science',
        'Physiotherapy',
        'Medical Laboratory Science',
        'Human Nutrition & Dietetics',
        'Biochemistry',
        'Physiology',
        'Anatomy',
        'Pharmacology & Therapeutics',
        'Pharmacy',
      ],
    },
    {
      faculty: 'Faculty of Agriculture',
      code: 'AGR',
      departments: [
        'Agricultural Economics',
        'Agricultural Extension & Rural Development',
        'Agronomy',
        'Animal Science',
        'Crop Protection & Environmental Biology',
        'Soil Resources Management',
      ],
    },
    {
      faculty: 'Faculty of Renewable Natural Resources',
      code: 'RNR',
      departments: [
        'Aquaculture & Fisheries Management',
        'Forest Resources Management',
        'Social & Environmental Forestry',
        'Wildlife & Ecotourism Management',
      ],
    },
    {
      faculty: 'Faculty of Veterinary Medicine',
      code: 'VET',
      departments: [
        'Veterinary Medicine',
        'Veterinary Surgery & Radiology',
        'Veterinary Anatomy',
        'Veterinary Pathology',
        'Veterinary Public Health & Preventive Medicine',
      ],
    },
    {
      faculty: 'Faculty of Education',
      code: 'EDU',
      departments: [
        'Educational Management',
        'Guidance & Counselling',
        'Adult Education',
        'Special Education',
        'Science & Technology Education',
        'Arts & Social Sciences Education',
        'Human Kinetics & Health Education',
        'Library, Archival & Information Studies',
      ],
    },
    {
      faculty: 'Faculty of Environmental Design & Management',
      code: 'EDM',
      departments: [
        'Architecture',
        'Estate Management',
        'Urban & Regional Planning',
        'Quantity Surveying',
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// UNILAG: University of Lagos (Faculties & College of Medicine)
// ---------------------------------------------------------------------------
export const UNILAG_STRUCTURE: AcademicStructure = {
  campusCode: 'UNILAG',
  groupType: 'Faculty',
  groups: [
    {
      faculty: 'Faculty of Engineering',
      code: 'ENG',
      departments: [
        'Computer Engineering',
        'Electrical & Electronics Engineering',
        'Mechanical Engineering',
        'Civil & Environmental Engineering',
        'Chemical & Petroleum Engineering',
        'Systems Engineering',
        'Metallurgical & Materials Engineering',
        'Surveying & Geoinformatics',
        'Biomedical Engineering',
      ],
    },
    {
      faculty: 'Faculty of Science',
      code: 'SCI',
      departments: [
        'Computer Science',
        'Mathematics',
        'Statistics',
        'Physics',
        'Chemistry',
        'Biochemistry',
        'Microbiology',
        'Cell Biology & Genetics',
        'Marine Sciences',
        'Geosciences',
        'Botany',
        'Zoology',
      ],
    },
    {
      faculty: 'Faculty of Social Sciences',
      code: 'SOCSCI',
      departments: [
        'Economics',
        'Mass Communication',
        'Political Science',
        'Psychology',
        'Sociology',
        'Geography',
        'Social Work',
      ],
    },
    {
      faculty: 'Faculty of Management Sciences',
      code: 'FMS',
      departments: [
        'Accounting',
        'Actuarial Science & Insurance',
        'Banking & Finance',
        'Business Administration',
        'Employment Relations & Human Resource Management (ER&HRM)',
        'Industrial Relations & Personnel Management',
      ],
    },
    {
      faculty: 'Faculty of Arts',
      code: 'ARTS',
      departments: [
        'Creative Arts (Theatre, Music, Visual Arts)',
        'English',
        'History & Strategic Studies',
        'Linguistics, African & Asian Studies',
        'Philosophy',
        'European Languages & Integration Studies',
      ],
    },
    {
      faculty: 'Faculty of Law',
      code: 'LAW',
      departments: [
        'Commercial & Industrial Law',
        'Jurisprudence & International Law',
        'Private & Property Law',
        'Public Law',
      ],
    },
    {
      faculty: 'Faculty of Environmental Sciences',
      code: 'ENV',
      departments: [
        'Architecture',
        'Building',
        'Estate Management',
        'Quantity Surveying',
        'Urban & Regional Planning',
      ],
    },
    {
      faculty: 'College of Medicine (CMUL)',
      code: 'CMUL',
      departments: [
        'Medicine & Surgery (MBBS)',
        'Dentistry',
        'Nursing Science',
        'Physiotherapy',
        'Medical Laboratory Science',
        'Pharmacology',
        'Physiology',
        'Anatomy',
        'Radiography',
      ],
    },
    {
      faculty: 'Faculty of Pharmacy',
      code: 'PHARM',
      departments: [
        'Clinical Pharmacy & Biopharmacy',
        'Pharmaceutical Chemistry',
        'Pharmaceutics & Pharmaceutical Technology',
        'Pharmacognosy',
        'Pharmacology, Therapeutics & Toxicology',
      ],
    },
    {
      faculty: 'Faculty of Education',
      code: 'EDU',
      departments: [
        'Educational Foundations',
        'Educational Management',
        'Arts & Social Sciences Education',
        'Science & Technology Education',
        'Human Kinetics & Health Education',
        'Adult Education',
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// UNN: University of Nigeria, Nsukka
// ---------------------------------------------------------------------------
export const UNN_STRUCTURE: AcademicStructure = {
  campusCode: 'UNN',
  groupType: 'Faculty',
  groups: [
    {
      faculty: 'Faculty of Engineering',
      code: 'ENG',
      departments: [
        'Civil Engineering',
        'Electrical & Electronic Engineering',
        'Mechanical Engineering',
        'Electronic Engineering',
        'Agricultural & Bioresources Engineering',
        'Metallurgical & Materials Engineering',
      ],
    },
    {
      faculty: 'Faculty of Physical Sciences',
      code: 'FPS',
      departments: [
        'Computer Science',
        'Mathematics',
        'Statistics',
        'Physics & Astronomy',
        'Pure & Industrial Chemistry',
        'Geology',
      ],
    },
    {
      faculty: 'Faculty of Biological Sciences',
      code: 'FBS',
      departments: [
        'Biochemistry',
        'Microbiology',
        'Plant Science & Biotechnology',
        'Zoology & Environmental Biology',
      ],
    },
    {
      faculty: 'Faculty of Social Sciences',
      code: 'FSS',
      departments: [
        'Economics',
        'Political Science',
        'Sociology & Anthropology',
        'Psychology',
        'Public Administration & Local Government',
        'Geography',
        'Mass Communication',
      ],
    },
    {
      faculty: 'Faculty of Business Administration',
      code: 'FBA',
      departments: [
        'Accountancy',
        'Banking & Finance',
        'Management',
        'Marketing',
      ],
    },
    {
      faculty: 'Faculty of Arts',
      code: 'ARTS',
      departments: [
        'English & Literary Studies',
        'History & International Studies',
        'Philosophy',
        'Music',
        'Theatre & Film Studies',
        'Linguistics & Nigerian Languages',
        'Foreign Languages & Literature',
        'Fine & Applied Arts',
        'Archaeology & Tourism',
      ],
    },
    {
      faculty: 'Faculty of Law',
      code: 'LAW',
      departments: [
        'Commercial & Property Law',
        'Customary & Indigenous Law',
        'International Law & Jurisprudence',
        'Public Law',
      ],
    },
    {
      faculty: 'Faculty of Medical Sciences & Health Sciences',
      code: 'MED',
      departments: [
        'Medicine & Surgery (MBBS)',
        'Nursing Sciences',
        'Medical Laboratory Sciences',
        'Medical Radiography & Radiological Sciences',
        'Medical Rehabilitation (Physiotherapy)',
        'Anatomy',
        'Physiology',
      ],
    },
    {
      faculty: 'Faculty of Pharmaceutical Sciences',
      code: 'PHARM',
      departments: [
        'Pharmaceutics',
        'Pharmaceutical Chemistry',
        'Pharmacognosy',
        'Pharmacology & Toxicology',
        'Clinical Pharmacy & Pharmacy Management',
      ],
    },
    {
      faculty: 'Faculty of Agriculture',
      code: 'AGR',
      departments: [
        'Agricultural Economics',
        'Agricultural Extension',
        'Animal Science',
        'Crop Science',
        'Food Science & Technology',
        'Soil Science',
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// OAU: Obafemi Awolowo University, Ile-Ife
// ---------------------------------------------------------------------------
export const OAU_STRUCTURE: AcademicStructure = {
  campusCode: 'OAU',
  groupType: 'Faculty',
  groups: [
    {
      faculty: 'Faculty of Technology',
      code: 'TECH',
      departments: [
        'Computer Science & Engineering',
        'Electronic & Electrical Engineering',
        'Mechanical Engineering',
        'Civil Engineering',
        'Chemical Engineering',
        'Agricultural & Environmental Engineering',
        'Food Science & Technology',
        'Materials Science & Engineering',
      ],
    },
    {
      faculty: 'Faculty of Science',
      code: 'SCI',
      departments: [
        'Mathematics',
        'Physics',
        'Chemistry',
        'Biochemistry',
        'Microbiology',
        'Botany',
        'Zoology',
        'Geology',
      ],
    },
    {
      faculty: 'Faculty of Social Sciences',
      code: 'SOCSCI',
      departments: [
        'Economics',
        'Political Science',
        'Sociology & Anthropology',
        'Psychology',
        'Geography',
        'Demography & Social Statistics',
      ],
    },
    {
      faculty: 'Faculty of Administration',
      code: 'ADMIN',
      departments: [
        'Management & Accounting',
        'Public Administration',
        'International Relations',
        'Local Government Studies',
      ],
    },
    {
      faculty: 'Faculty of Arts',
      code: 'ARTS',
      departments: [
        'English Language & Literature',
        'History',
        'Philosophy',
        'Dramatic Arts',
        'Music',
        'Linguistics & African Languages',
        'Foreign Languages',
        'Religious Studies',
      ],
    },
    {
      faculty: 'Faculty of Law',
      code: 'LAW',
      departments: [
        'Business Law',
        'International Law',
        'Jurisprudence & Private Law',
        'Public Law',
      ],
    },
    {
      faculty: 'College of Health Sciences',
      code: 'CHS',
      departments: [
        'Medicine & Surgery (MBBS)',
        'Dentistry',
        'Nursing Science',
        'Medical Rehabilitation',
        'Physiology',
        'Anatomy',
      ],
    },
    {
      faculty: 'Faculty of Pharmacy',
      code: 'PHARM',
      departments: [
        'Clinical Pharmacy',
        'Pharmaceutical Chemistry',
        'Pharmaceutics',
        'Pharmacognosy',
        'Pharmacology',
      ],
    },
    {
      faculty: 'Faculty of Environmental Design & Management',
      code: 'EDM',
      departments: [
        'Architecture',
        'Building',
        'Estate Management',
        'Quantity Surveying',
        'Urban & Regional Planning',
        'Fine & Applied Arts',
      ],
    },
    {
      faculty: 'Faculty of Agriculture',
      code: 'AGR',
      departments: [
        'Agricultural Economics',
        'Animal Sciences',
        'Crop Production & Protection',
        'Soil Science & Land Resources',
        'Family, Nutrition & Consumer Sciences',
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// CU: Covenant University (Colleges)
// ---------------------------------------------------------------------------
export const CU_STRUCTURE: AcademicStructure = {
  campusCode: 'CU',
  groupType: 'College',
  groups: [
    {
      faculty: 'College of Science & Technology (CST)',
      code: 'CST',
      departments: [
        'Computer Science',
        'Management Information Systems (MIS)',
        'Mathematics',
        'Physics',
        'Chemistry',
        'Biochemistry',
        'Microbiology',
        'Industrial Chemistry',
        'Building Technology',
        'Estate Management',
        'Architecture',
      ],
    },
    {
      faculty: 'College of Engineering (COE)',
      code: 'COE',
      departments: [
        'Computer Engineering',
        'Electrical & Electronics Engineering',
        'Information & Communication Engineering (ICE)',
        'Mechanical Engineering',
        'Civil Engineering',
        'Chemical Engineering',
        'Petroleum Engineering',
      ],
    },
    {
      faculty: 'College of Management & Social Sciences (CMSS)',
      code: 'CMSS',
      departments: [
        'Accounting',
        'Banking & Finance',
        'Business Administration',
        'Economics',
        'Mass Communication',
        'Sociology',
        'Demography & Social Statistics',
        'Industrial Relations & Human Resource Management',
      ],
    },
    {
      faculty: 'College of Leadership Development Studies (CLDS)',
      code: 'CLDS',
      departments: [
        'Political Science & International Relations',
        'Policy & Strategic Studies',
        'Languages & General Studies',
        'Psychology',
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// GLOBAL / General Nigerian University Default Structure (Faculties)
// ---------------------------------------------------------------------------
export const GLOBAL_STRUCTURE: AcademicStructure = {
  campusCode: 'GLOBAL',
  groupType: 'Faculty',
  groups: [
    {
      faculty: 'Engineering & Technology',
      code: 'ENG',
      departments: [
        'Computer Engineering',
        'Electrical & Electronic Engineering',
        'Mechanical Engineering',
        'Civil Engineering',
        'Chemical Engineering',
        'Petroleum Engineering',
        'Agricultural & Environmental Engineering',
        'Biomedical Engineering',
        'Materials Science & Engineering',
        'Mechatronics Engineering',
        'Systems Engineering',
        'Surveying & Geoinformatics',
      ],
    },
    {
      faculty: 'Sciences & Computing',
      code: 'SCI',
      departments: [
        'Computer Science',
        'Mathematics',
        'Statistics',
        'Physics',
        'Chemistry',
        'Biological Sciences',
        'Microbiology',
        'Biochemistry',
        'Geology',
        'Industrial Chemistry',
        'Botany',
        'Zoology',
      ],
    },
    {
      faculty: 'Social Sciences',
      code: 'SOCSCI',
      departments: [
        'Economics',
        'Political Science',
        'Sociology',
        'Psychology',
        'Mass Communication',
        'International Relations',
        'Geography',
        'Public Administration',
      ],
    },
    {
      faculty: 'Arts & Humanities',
      code: 'ARTS',
      departments: [
        'English',
        'History & Diplomatic Studies',
        'Philosophy',
        'Linguistics',
        'French & Modern Languages',
        'Theatre & Film Studies',
        'Religious Studies',
        'Fine & Applied Arts',
        'Music',
        'Creative Arts',
      ],
    },
    {
      faculty: 'Law',
      code: 'LAW',
      departments: [
        'Common & Islamic Law',
        'Public & Private Law',
        'Commercial Law',
        'International Law & Jurisprudence',
      ],
    },
    {
      faculty: 'Medicine, Pharmacy & Health Sciences',
      code: 'MED',
      departments: [
        'Medicine & Surgery (MBBS)',
        'Nursing Science',
        'Pharmacy',
        'Physiology',
        'Anatomy',
        'Public Health',
        'Dentistry',
        'Medical Laboratory Science',
        'Physiotherapy',
        'Radiography',
      ],
    },
    {
      faculty: 'Management, Business & Finance',
      code: 'BUS',
      departments: [
        'Business Administration',
        'Accounting',
        'Banking & Finance',
        'Marketing',
        'Actuarial Science',
        'Insurance',
        'Entrepreneurship',
        'Human Resource Management',
      ],
    },
    {
      faculty: 'Education',
      code: 'EDU',
      departments: [
        'Educational Management',
        'Guidance & Counselling',
        'Science Education',
        'Arts Education',
        'Adult Education',
        'Human Kinetics & Health Education',
        'Early Childhood Education',
      ],
    },
    {
      faculty: 'Agriculture & Veterinary',
      code: 'AGR',
      departments: [
        'Agricultural Science',
        'Animal Science',
        'Crop Science',
        'Food Science & Technology',
        'Forestry & Wildlife',
        'Soil Science',
        'Agricultural Economics',
        'Veterinary Medicine',
        'Fisheries & Aquaculture',
      ],
    },
    {
      faculty: 'Environmental Design',
      code: 'ENV',
      departments: [
        'Architecture',
        'Urban & Regional Planning',
        'Estate Management',
        'Building Technology',
        'Quantity Surveying',
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// KDU: KolaDaisi University, Ibadan
// ---------------------------------------------------------------------------
export const KDU_STRUCTURE: AcademicStructure = {
  campusCode: 'KDU',
  groupType: 'Faculty',
  groups: [
    {
      faculty: 'Faculty of Applied Sciences',
      code: 'FAS',
      departments: [
        'Computer Science',
        'Software Engineering',
        'Cyber Security',
        'Information Technology',
        'Biochemistry',
        'Microbiology',
        'Industrial Chemistry',
        'Physics with Electronics',
        'Mathematics',
      ],
    },
    {
      faculty: 'Faculty of Arts, Management & Social Sciences',
      code: 'FAMSS',
      departments: [
        'Accounting',
        'Banking & Finance',
        'Business Administration',
        'Economics',
        'Mass Communication',
        'Political Science',
        'English & Literary Studies',
        'International Relations',
      ],
    },
    {
      faculty: 'Faculty of Law',
      code: 'LAW',
      departments: [
        'Commercial Law',
        'Private and Public Law',
      ],
    },
    {
      faculty: 'Faculty of Basic Medical Sciences',
      code: 'FBMS',
      departments: [
        'Medical Laboratory Science',
        'Nursing Science',
        'Public Health',
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// NOUN: National Open University of Nigeria
// ---------------------------------------------------------------------------
export const NOUN_STRUCTURE: AcademicStructure = {
  campusCode: 'NOUN',
  groupType: 'Faculty',
  groups: [
    {
      faculty: 'Faculty of Agricultural Sciences',
      code: 'AGR',
      departments: [
        'Agricultural Economics & Extension',
        'Animal Science',
        'Crop Science',
        'Soil Science',
        'Fisheries & Aquaculture',
      ],
    },
    {
      faculty: 'Faculty of Arts',
      code: 'ART',
      departments: [
        'English',
        'Linguistics, Foreign & Nigerian Languages',
        'Religious Studies',
        'Philosophy',
        'History & International Studies',
      ],
    },
    {
      faculty: 'Faculty of Education',
      code: 'EDU',
      departments: [
        'Educational Foundations',
        'Arts & Social Sciences Education',
        'Science Education',
        'Early Childhood Education',
        'Educational Management',
      ],
    },
    {
      faculty: 'Faculty of Health Sciences',
      code: 'FHS',
      departments: [
        'Nursing Science',
        'Public Health',
        'Environmental Health Science',
      ],
    },
    {
      faculty: 'Faculty of Law',
      code: 'LAW',
      departments: [
        'Commercial Law',
        'Jurisprudence & International Law',
        'Private & Property Law',
        'Public Law',
      ],
    },
    {
      faculty: 'Faculty of Management Sciences',
      code: 'FMS',
      departments: [
        'Accounting',
        'Banking & Finance',
        'Business Administration',
        'Public Administration',
        'Entrepreneurship',
        'Marketing',
      ],
    },
    {
      faculty: 'Faculty of Sciences',
      code: 'SCI',
      departments: [
        'Computer Science',
        'Information Technology',
        'Data Management',
        'Environmental Science',
        'Mathematics',
        'Physics',
        'Chemistry',
        'Biological Sciences',
      ],
    },
    {
      faculty: 'Faculty of Social Sciences',
      code: 'FSS',
      departments: [
        'Criminology & Security Studies',
        'Economics',
        'Mass Communication',
        'Political Science',
        'Peace Studies & Conflict Resolution',
        'Tourism Studies',
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// ESUT: Enugu State University of Science and Technology (Faculties)
// ---------------------------------------------------------------------------
export const ESUT_STRUCTURE: AcademicStructure = {
  campusCode: 'ESUT',
  groupType: 'Faculty',
  groups: [
    {
      faculty: 'Faculty of Engineering',
      code: 'ENG',
      departments: [
        'Chemical Engineering',
        'Civil Engineering',
        'Computer Engineering',
        'Electrical & Electronic Engineering',
        'Mechanical & Production Engineering',
        'Metallurgical & Materials Engineering',
        'Agricultural Engineering',
      ],
    },
    {
      faculty: 'Faculty of Applied Natural Sciences',
      code: 'FANS',
      departments: [
        'Computer Science',
        'Mathematics & Statistics',
        'Biochemistry',
        'Microbiology',
        'Industrial Physics',
        'Applied Biology & Biotechnology',
        'Industrial Chemistry',
        'Geology & Mining',
      ],
    },
    {
      faculty: 'Faculty of Management Sciences',
      code: 'FMS',
      departments: [
        'Accountancy',
        'Banking & Finance',
        'Business Administration',
        'Marketing',
        'Insurance & Risk Management',
        'Public Administration',
        'Cooperative & Rural Development',
      ],
    },
    {
      faculty: 'Faculty of Law',
      code: 'LAW',
      departments: [
        'Commercial Law',
        'Private Law',
        'Public Law',
        'Jurisprudence & International Law',
      ],
    },
    {
      faculty: 'Faculty of Environmental Sciences',
      code: 'ENV',
      departments: [
        'Architecture',
        'Building Technology',
        'Estate Management',
        'Quantity Surveying',
        'Surveying & Geoinformatics',
        'Urban & Regional Planning',
      ],
    },
    {
      faculty: 'College of Medicine & Health Sciences',
      code: 'CMHS',
      departments: [
        'Medicine & Surgery',
        'Medical Laboratory Science',
        'Nursing Sciences',
        'Anatomy',
        'Physiology',
      ],
    },
    {
      faculty: 'Faculty of Pharmaceutical Sciences',
      code: 'PHARM',
      departments: [
        'Pharmacy',
        'Pharmacology',
        'Pharmaceutical Chemistry',
        'Pharmaceutics',
      ],
    },
    {
      faculty: 'Faculty of Agriculture & Natural Resources',
      code: 'AGRIC',
      departments: [
        'Agricultural Economics & Extension',
        'Agronomy & Ecological Management',
        'Animal Science & Fisheries',
        'Food Science & Technology',
      ],
    },
    {
      faculty: 'Faculty of Education',
      code: 'EDU',
      departments: [
        'Science Education',
        'Educational Management',
        'Technology & Vocational Education',
        'Guidance & Counselling',
        'Adult Education',
      ],
    },
    {
      faculty: 'Faculty of Social Sciences & Humanities',
      code: 'FSS',
      departments: [
        'Economics',
        'Mass Communication',
        'Political Science',
        'Psychology',
        'Sociology',
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// MUN: Madonna University, Nigeria (official undergraduate programme groups)
// ---------------------------------------------------------------------------
export const MUN_STRUCTURE: AcademicStructure = {
  campusCode: 'MUN',
  groupType: 'Faculty',
  groups: [
    {
      faculty: 'Faculty of Management Sciences',
      code: 'MAN',
      departments: ['Accounting', 'Banking & Finance', 'Business Administration', 'Entrepreneurship', 'Marketing', 'Public Administration'],
    },
    {
      faculty: 'Faculty of Computing & Information Technology',
      code: 'CIT',
      departments: ['Computer Science', 'Cybersecurity', 'Information Technology', 'Software Engineering'],
    },
    {
      faculty: 'Faculty of Law',
      code: 'LAW',
      departments: ['Law'],
    },
    {
      faculty: 'Faculty of Medicine & Basic Medical Sciences',
      code: 'MED',
      departments: ['Medicine & Surgery', 'Anatomy', 'Biochemistry', 'Physiology'],
    },
    {
      faculty: 'Faculty of Pharmacy',
      code: 'PHA',
      departments: ['Pharmacy'],
    },
    {
      faculty: 'Faculty of Engineering & Technology',
      code: 'ENG',
      departments: ['Chemical Engineering', 'Civil Engineering', 'Electrical & Electronics Engineering', 'Mechanical Engineering'],
    },
    {
      faculty: 'Faculty of Environmental Sciences',
      code: 'ENV',
      departments: ['Architecture', 'Building Technology', 'Estate Management'],
    },
    {
      faculty: 'Faculty of Sciences',
      code: 'SCI',
      departments: ['Chemistry', 'Mathematics', 'Microbiology', 'Physics'],
    },
    {
      faculty: 'Faculty of Social Sciences',
      code: 'SOC',
      departments: ['Economics', 'Political Science', 'Psychology', 'Sociology'],
    },
    {
      faculty: 'Faculty of Arts & Humanities',
      code: 'ART',
      departments: ['English', 'History & International Studies', 'Philosophy', 'Religious Studies'],
    },
    {
      faculty: 'Faculty of Communication & Media Studies',
      code: 'CMS',
      departments: ['Broadcasting', 'Information & Media Studies', 'Mass Communication', 'Public Relations'],
    },
    {
      faculty: 'Faculty of Education',
      code: 'EDU',
      departments: ['Education'],
    },
  ],
};

// Map of all academic structures by campus code
const STRUCTURE_MAP: Record<string, AcademicStructure> = {
  FUNAAB: FUNAAB_STRUCTURE,
  UI: UI_STRUCTURE,
  UNILAG: UNILAG_STRUCTURE,
  UNN: UNN_STRUCTURE,
  OAU: OAU_STRUCTURE,
  CU: CU_STRUCTURE,
  KDU: KDU_STRUCTURE,
  NOUN: NOUN_STRUCTURE,
  ESUT: ESUT_STRUCTURE,
  MUN: MUN_STRUCTURE,
  GLOBAL: GLOBAL_STRUCTURE,
};

/**
 * Returns the academic structure (Colleges or Faculties) for a given campus code.
 * Defaults to GLOBAL_STRUCTURE if campus code is unspecified or unknown.
 */
export function getAcademicStructure(campusCode?: string): AcademicStructure {
  const code = (campusCode || 'GLOBAL').toUpperCase().trim();
  return STRUCTURE_MAP[code] || GLOBAL_STRUCTURE;
}

/**
 * Returns all departments for a given campus code.
 */
export function getDepartmentsForCampus(campusCode?: string): string[] {
  const structure = getAcademicStructure(campusCode);
  const depts = structure.groups.flatMap((g) => g.departments);
  // Deduplicate just in case
  return Array.from(new Set(depts));
}

/**
 * Finds the parent college or faculty for a specific department within a campus.
 */
export function getFacultyForDepartment(departmentName: string, campusCode?: string): string | undefined {
  const structure = getAcademicStructure(campusCode);
  const clean = departmentName.toLowerCase().trim();
  for (const group of structure.groups) {
    if (group.departments.some((d) => d.toLowerCase().trim() === clean)) {
      return group.faculty;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Backwards Compatibility Exports
// ---------------------------------------------------------------------------
export const FACULTIES: FacultyGroup[] = GLOBAL_STRUCTURE.groups;
export const ALL_DEPARTMENTS: string[] = GLOBAL_STRUCTURE.groups.flatMap((f) => f.departments);
