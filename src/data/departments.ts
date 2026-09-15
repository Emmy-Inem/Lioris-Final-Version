/**
 * Single source of truth for academic department/faculty options.
 *
 * Previously 3 different hardcoded lists existed (an 8-option list in
 * onboarding's department step, a 3-option list in LibraryFilterModal, a
 * 6-option list in AcademicLibraryModal), none matching, none covering more
 * than a handful of faculties. This mirrors the real faculty structure of a
 * typical Nigerian university so a profile's department field means
 * something searchable and comparable across the app.
 */

export interface FacultyGroup {
  faculty: string;
  departments: string[];
}

export const FACULTIES: FacultyGroup[] = [
  {
    faculty: 'Engineering',
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
    ],
  },
  {
    faculty: 'Sciences',
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
    ],
  },
  {
    faculty: 'Social Sciences',
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
    departments: [
      'English',
      'History & Diplomatic Studies',
      'Philosophy',
      'Linguistics',
      'French',
      'Theatre & Film Studies',
      'Religious Studies',
      'Fine & Applied Arts',
    ],
  },
  {
    faculty: 'Law',
    departments: ['Common & Islamic Law', 'Public & Private Law', 'International & Jurisprudence'],
  },
  {
    faculty: 'Medicine & Health Sciences',
    departments: [
      'Medicine & Surgery',
      'Nursing Science',
      'Pharmacy',
      'Physiology',
      'Anatomy',
      'Public Health',
      'Dentistry',
      'Medical Laboratory Science',
      'Physiotherapy',
    ],
  },
  {
    faculty: 'Management & Business',
    departments: [
      'Business Administration',
      'Accounting',
      'Banking & Finance',
      'Marketing',
      'Actuarial Science',
      'Insurance',
      'Entrepreneurship',
    ],
  },
  {
    faculty: 'Education',
    departments: [
      'Educational Management',
      'Guidance & Counselling',
      'Science Education',
      'Arts Education',
      'Early Childhood Education',
    ],
  },
  {
    faculty: 'Agriculture',
    departments: [
      'Agricultural Science',
      'Animal Science',
      'Crop Science',
      'Food Science & Technology',
      'Forestry & Wildlife',
      'Soil Science',
    ],
  },
  {
    faculty: 'Environmental Design',
    departments: [
      'Architecture',
      'Urban & Regional Planning',
      'Estate Management',
      'Building Technology',
      'Quantity Surveying',
    ],
  },
];

export const ALL_DEPARTMENTS: string[] = FACULTIES.flatMap((f) => f.departments);
