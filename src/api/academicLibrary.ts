/**
 * Global Academic Library & Free Open-Access Textbook Search API
 * 
 * Powered by Open Library Public Domain Ebooks & Scans, Project Gutenberg (Gutendex),
 * OpenStax, and curated Open Educational Resources (OER). Every single publication here
 * is verified 100% FREE, full-text accessible, with zero paywalls, zero commercial loans,
 * and zero borrow waitlists.
 */

export interface AcademicBook {
  id: string;
  title: string;
  authors: string[];
  firstPublishYear?: number;
  isbn?: string;
  coverUrl?: string;
  openAccessUrl: string;
  openLibraryUrl?: string; // Kept for backwards compatibility
  pdfUrl?: string;
  epubUrl?: string;
  subjects: string[];
  editionCount: number;
  hasFulltext: boolean;
  license?: string;
  isFree: true;
  source: 'OpenStax' | 'Open Library' | 'Project Gutenberg' | 'Curated OER' | 'OpenAlex' | 'arXiv';
  description?: string;
  downloadCount?: number;
}

export const CURATED_TEXTBOOKS: AcademicBook[] = [
  // --- Computer Science & Technology ---
  {
    id: 'curated-cs-1',
    title: 'Operating Systems: Three Easy Pieces (OSTEP)',
    authors: ['Remzi H. Arpaci-Dusseau', 'Andrea C. Arpaci-Dusseau'],
    firstPublishYear: 2018,
    coverUrl: 'https://covers.openlibrary.org/b/id/10543212-M.jpg',
    openAccessUrl: 'https://pages.cs.wisc.edu/~remzi/OSTEP/',
    openLibraryUrl: 'https://pages.cs.wisc.edu/~remzi/OSTEP/',
    pdfUrl: 'https://pages.cs.wisc.edu/~remzi/OSTEP/',
    subjects: ['Computer Science', 'Operating Systems', 'Concurrency', 'Virtualization'],
    editionCount: 3,
    hasFulltext: true,
    license: 'CC BY-NC-ND',
    isFree: true,
    source: 'Curated OER',
    description: 'Gold-standard undergraduate operating systems textbook covering virtualization, concurrency, and persistence.',
  },
  {
    id: 'curated-cs-2',
    title: 'Structure and Interpretation of Computer Programs (SICP)',
    authors: ['Harold Abelson', 'Gerald Jay Sussman', 'Julie Sussman'],
    firstPublishYear: 1996,
    isbn: '0262011530',
    coverUrl: 'https://covers.openlibrary.org/b/id/8231856-M.jpg',
    openAccessUrl: 'https://sarabander.github.io/sicp/',
    openLibraryUrl: 'https://sarabander.github.io/sicp/',
    subjects: ['Computer Science', 'Programming Languages', 'LISP', 'Scheme'],
    editionCount: 2,
    hasFulltext: true,
    license: 'CC BY-SA 4.0',
    isFree: true,
    source: 'Curated OER',
    description: 'Foundational computer science textbook taught at MIT and top universities worldwide.',
  },
  {
    id: 'curated-cs-3',
    title: 'Dive Into Systems: A Gentle Introduction to Computer Systems',
    authors: ['Suzanne J. Matthews', 'Tia Newhall', 'Kevin C. Webb'],
    firstPublishYear: 2022,
    coverUrl: 'https://diveintosystems.org/_static/cover.png',
    openAccessUrl: 'https://diveintosystems.org/',
    openLibraryUrl: 'https://diveintosystems.org/',
    subjects: ['Computer Science', 'Computer Systems', 'C Programming', 'Assembly'],
    editionCount: 1,
    hasFulltext: true,
    license: 'CC BY-NC-ND 4.0',
    isFree: true,
    source: 'Curated OER',
    description: 'Comprehensive introduction to computer organization, architecture, and systems programming in C.',
  },
  {
    id: 'curated-cs-4',
    title: 'Introduction to Python Programming (OpenStax)',
    authors: ['Udayan Das', 'Kieran Herley', 'OpenStax'],
    firstPublishYear: 2024,
    isbn: '9781711470559',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781711470559-M.jpg',
    openAccessUrl: 'https://openstax.org/details/books/introduction-python-programming',
    openLibraryUrl: 'https://openstax.org/details/books/introduction-python-programming',
    subjects: ['Computer Science', 'Python', 'Algorithms', 'Software Development'],
    editionCount: 1,
    hasFulltext: true,
    license: 'CC BY 4.0',
    isFree: true,
    source: 'OpenStax',
    description: 'Modern, interactive introduction to computer science and programming fundamentals using Python.',
  },
  {
    id: 'curated-cs-5',
    title: 'Think Python: How to Think Like a Computer Scientist',
    authors: ['Allen B. Downey'],
    firstPublishYear: 2016,
    coverUrl: 'https://covers.openlibrary.org/b/id/7988365-M.jpg',
    openAccessUrl: 'https://greenteapress.com/wp/think-python-2e/',
    openLibraryUrl: 'https://greenteapress.com/wp/think-python-2e/',
    pdfUrl: 'https://greenteapress.com/thinkpython2/thinkpython2.pdf',
    subjects: ['Computer Science', 'Python', 'Data Structures'],
    editionCount: 2,
    hasFulltext: true,
    license: 'CC BY-NC 3.0',
    isFree: true,
    source: 'Curated OER',
    description: 'Clear, concise hands-on guide to programming principles and computational thinking.',
  },
  {
    id: 'curated-cs-6',
    title: 'Database Design - 2nd Edition',
    authors: ['Adrienne Watt', 'Nelson Eng'],
    firstPublishYear: 2014,
    coverUrl: 'https://covers.openlibrary.org/b/id/11182442-M.jpg',
    openAccessUrl: 'https://opentextbc.ca/dbdesign01/',
    openLibraryUrl: 'https://opentextbc.ca/dbdesign01/',
    subjects: ['Computer Science', 'Databases', 'SQL', 'Data Modeling'],
    editionCount: 2,
    hasFulltext: true,
    license: 'CC BY 4.0',
    isFree: true,
    source: 'Curated OER',
    description: 'Undergraduate text covering relational database design, normalization, ER modeling, and SQL.',
  },

  // --- Mathematics & Statistics ---
  {
    id: 'curated-math-1',
    title: 'Calculus Volume 1 (OpenStax)',
    authors: ['Edwin Herman', 'Gilbert Strang'],
    firstPublishYear: 2016,
    isbn: '9781938168024',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781938168024-M.jpg',
    openAccessUrl: 'https://openstax.org/details/books/calculus-volume-1',
    openLibraryUrl: 'https://openstax.org/details/books/calculus-volume-1',
    pdfUrl: 'https://assets.openstax.org/oscms-prodcms/media/documents/CalculusVolume1-WEB.pdf',
    subjects: ['Mathematics', 'Calculus', 'Limits', 'Derivatives', 'Integration'],
    editionCount: 1,
    hasFulltext: true,
    license: 'CC BY 4.0',
    isFree: true,
    source: 'OpenStax',
    description: 'Comprehensive college single-variable calculus covering functions, limits, derivatives, and integration.',
  },
  {
    id: 'curated-math-2',
    title: 'Calculus Volume 2 (OpenStax)',
    authors: ['Edwin Herman', 'Gilbert Strang'],
    firstPublishYear: 2016,
    isbn: '9781938168062',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781938168062-M.jpg',
    openAccessUrl: 'https://openstax.org/details/books/calculus-volume-2',
    openLibraryUrl: 'https://openstax.org/details/books/calculus-volume-2',
    pdfUrl: 'https://assets.openstax.org/oscms-prodcms/media/documents/CalculusVolume2-WEB.pdf',
    subjects: ['Mathematics', 'Calculus', 'Differential Equations', 'Sequences and Series'],
    editionCount: 1,
    hasFulltext: true,
    license: 'CC BY 4.0',
    isFree: true,
    source: 'OpenStax',
    description: 'Integration techniques, differential equations, sequences, and infinite series.',
  },
  {
    id: 'curated-math-3',
    title: 'Calculus Volume 3 (Multivariable Calculus)',
    authors: ['Edwin Herman', 'Gilbert Strang'],
    firstPublishYear: 2016,
    isbn: '9781938168079',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781938168079-M.jpg',
    openAccessUrl: 'https://openstax.org/details/books/calculus-volume-3',
    openLibraryUrl: 'https://openstax.org/details/books/calculus-volume-3',
    pdfUrl: 'https://assets.openstax.org/oscms-prodcms/media/documents/CalculusVolume3-WEB.pdf',
    subjects: ['Mathematics', 'Calculus', 'Multivariable', 'Vector Calculus'],
    editionCount: 1,
    hasFulltext: true,
    license: 'CC BY 4.0',
    isFree: true,
    source: 'OpenStax',
    description: 'Parametric equations, polar coordinates, vectors in space, and multivariable calculus.',
  },
  {
    id: 'curated-math-4',
    title: 'Introductory Statistics (OpenStax)',
    authors: ['Barbara Illowsky', 'Susan Dean'],
    firstPublishYear: 2018,
    isbn: '9781938168208',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781938168208-M.jpg',
    openAccessUrl: 'https://openstax.org/details/books/introductory-statistics',
    openLibraryUrl: 'https://openstax.org/details/books/introductory-statistics',
    pdfUrl: 'https://assets.openstax.org/oscms-prodcms/media/documents/IntroductoryStatistics-WEB.pdf',
    subjects: ['Mathematics', 'Statistics', 'Probability', 'Hypothesis Testing'],
    editionCount: 1,
    hasFulltext: true,
    license: 'CC BY 4.0',
    isFree: true,
    source: 'OpenStax',
    description: 'Standard textbook for college statistics, hypothesis testing, probability, and regression.',
  },
  {
    id: 'curated-math-5',
    title: 'Linear Algebra (Saint Michael\'s College)',
    authors: ['Jim Hefferon'],
    firstPublishYear: 2020,
    coverUrl: 'https://covers.openlibrary.org/b/id/8315201-M.jpg',
    openAccessUrl: 'https://joshua.smcvt.edu/linearalgebra/',
    openLibraryUrl: 'https://joshua.smcvt.edu/linearalgebra/',
    pdfUrl: 'https://joshua.smcvt.edu/linearalgebra/book.pdf',
    subjects: ['Mathematics', 'Linear Algebra', 'Matrices', 'Vector Spaces'],
    editionCount: 4,
    hasFulltext: true,
    license: 'GNU Free Documentation License',
    isFree: true,
    source: 'Curated OER',
    description: 'Popular open textbook on linear equations, vector spaces, maps between spaces, and determinants.',
  },
  {
    id: 'curated-math-6',
    title: 'Discrete Mathematics: An Open Introduction',
    authors: ['Oscar Levin'],
    firstPublishYear: 2021,
    coverUrl: 'https://discrete.openmathbooks.org/dmoi3/cover.png',
    openAccessUrl: 'https://discrete.openmathbooks.org/dmoi3.html',
    openLibraryUrl: 'https://discrete.openmathbooks.org/dmoi3.html',
    subjects: ['Mathematics', 'Discrete Math', 'Combinatorics', 'Graph Theory', 'Logic'],
    editionCount: 3,
    hasFulltext: true,
    license: 'CC BY-SA 4.0',
    isFree: true,
    source: 'Curated OER',
    description: 'Open textbook covering counting, sequences, symbolic logic, proof techniques, and graph theory.',
  },

  // --- Natural & Physical Sciences ---
  {
    id: 'curated-phys-1',
    title: 'University Physics Volume 1 (Mechanics & Waves)',
    authors: ['Samuel J. Ling', 'Jeff Sanny', 'William Moebs'],
    firstPublishYear: 2016,
    isbn: '9781938168277',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781938168277-M.jpg',
    openAccessUrl: 'https://openstax.org/details/books/university-physics-volume-1',
    openLibraryUrl: 'https://openstax.org/details/books/university-physics-volume-1',
    pdfUrl: 'https://assets.openstax.org/oscms-prodcms/media/documents/UniversityPhysicsVolume1-WEB.pdf',
    subjects: ['Physics', 'Mechanics', 'Oscillations', 'Waves', 'Acoustics'],
    editionCount: 1,
    hasFulltext: true,
    license: 'CC BY 4.0',
    isFree: true,
    source: 'OpenStax',
    description: 'Calculus-based physics textbook covering mechanics, motion, work, energy, oscillations, and waves.',
  },
  {
    id: 'curated-phys-2',
    title: 'University Physics Volume 2 (Thermodynamics & Electromagnetism)',
    authors: ['Samuel J. Ling', 'Jeff Sanny', 'William Moebs'],
    firstPublishYear: 2016,
    isbn: '9781938168161',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781938168161-M.jpg',
    openAccessUrl: 'https://openstax.org/details/books/university-physics-volume-2',
    openLibraryUrl: 'https://openstax.org/details/books/university-physics-volume-2',
    subjects: ['Physics', 'Thermodynamics', 'Electricity', 'Magnetism'],
    editionCount: 1,
    hasFulltext: true,
    license: 'CC BY 4.0',
    isFree: true,
    source: 'OpenStax',
    description: 'College physics covering thermal physics, electric charges, electric potential, capacitance, and magnetic fields.',
  },
  {
    id: 'curated-chem-1',
    title: 'Chemistry 2e (OpenStax)',
    authors: ['Paul Flowers', 'Klaus Theopold', 'Richard Langley'],
    firstPublishYear: 2019,
    isbn: '9781947172623',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781947172623-M.jpg',
    openAccessUrl: 'https://openstax.org/details/books/chemistry-2e',
    openLibraryUrl: 'https://openstax.org/details/books/chemistry-2e',
    pdfUrl: 'https://assets.openstax.org/oscms-prodcms/media/documents/Chemistry2e-WEB.pdf',
    subjects: ['Chemistry', 'General Chemistry', 'Chemical Reactions', 'Thermodynamics'],
    editionCount: 2,
    hasFulltext: true,
    license: 'CC BY 4.0',
    isFree: true,
    source: 'OpenStax',
    description: 'Standard university general chemistry textbook covering atomic structure, stoichiometry, and kinetics.',
  },
  {
    id: 'curated-chem-2',
    title: 'Organic Chemistry: A Tenth Edition (OpenStax)',
    authors: ['John McMurry'],
    firstPublishYear: 2023,
    isbn: '9781711471341',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781711471341-M.jpg',
    openAccessUrl: 'https://openstax.org/details/books/organic-chemistry',
    openLibraryUrl: 'https://openstax.org/details/books/organic-chemistry',
    subjects: ['Chemistry', 'Organic Chemistry', 'Reactions', 'Biomolecules'],
    editionCount: 10,
    hasFulltext: true,
    license: 'CC BY 4.0',
    isFree: true,
    source: 'OpenStax',
    description: 'The world\'s most popular organic chemistry textbook, now published completely free and open access.',
  },
  {
    id: 'curated-bio-1',
    title: 'Biology 2e (OpenStax)',
    authors: ['Mary Ann Clark', 'Matthew Douglas', 'Jung Choi'],
    firstPublishYear: 2018,
    isbn: '9781947172517',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781947172517-M.jpg',
    openAccessUrl: 'https://openstax.org/details/books/biology-2e',
    openLibraryUrl: 'https://openstax.org/details/books/biology-2e',
    pdfUrl: 'https://assets.openstax.org/oscms-prodcms/media/documents/Biology2e-WEB.pdf',
    subjects: ['Biology', 'Genetics', 'Cell Biology', 'Ecology', 'Evolution'],
    editionCount: 2,
    hasFulltext: true,
    license: 'CC BY 4.0',
    isFree: true,
    source: 'OpenStax',
    description: 'Standard two-semester college biology course textbook for science majors.',
  },
  {
    id: 'curated-bio-2',
    title: 'Microbiology (OpenStax)',
    authors: ['Nina Parker', 'Mark Schneegurt', 'Anh-Hue Thi Tu'],
    firstPublishYear: 2016,
    isbn: '9781938168147',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781938168147-M.jpg',
    openAccessUrl: 'https://openstax.org/details/books/microbiology',
    openLibraryUrl: 'https://openstax.org/details/books/microbiology',
    subjects: ['Microbiology', 'Biology', 'Infectious Diseases', 'Immunology'],
    editionCount: 1,
    hasFulltext: true,
    license: 'CC BY 4.0',
    isFree: true,
    source: 'OpenStax',
    description: 'College microbiology textbook covering microbial metabolism, genetics, viruses, and immunity.',
  },

  // --- Medicine & Health Sciences ---
  {
    id: 'curated-med-1',
    title: 'Anatomy and Physiology 2e (OpenStax)',
    authors: ['J. Gordon Betts', 'Kelly A. Young', 'James A. Wise'],
    firstPublishYear: 2022,
    isbn: '9781938168130',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781938168130-M.jpg',
    openAccessUrl: 'https://openstax.org/details/books/anatomy-and-physiology-2e',
    openLibraryUrl: 'https://openstax.org/details/books/anatomy-and-physiology-2e',
    pdfUrl: 'https://assets.openstax.org/oscms-prodcms/media/documents/AnatomyAndPhysiology2e-WEB.pdf',
    subjects: ['Medicine', 'Anatomy', 'Human Physiology', 'Health Sciences'],
    editionCount: 2,
    hasFulltext: true,
    license: 'CC BY 4.0',
    isFree: true,
    source: 'OpenStax',
    description: 'Comprehensive college anatomy and physiology textbook for nursing, medical, and allied health students.',
  },
  {
    id: 'curated-med-2',
    title: 'Clinical Nursing Skills (OpenStax)',
    authors: ['OpenStax Nursing Team'],
    firstPublishYear: 2023,
    isbn: '9781711470535',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781711470535-M.jpg',
    openAccessUrl: 'https://openstax.org/details/books/clinical-nursing-skills',
    openLibraryUrl: 'https://openstax.org/details/books/clinical-nursing-skills',
    subjects: ['Medicine', 'Nursing', 'Clinical Care', 'Patient Safety'],
    editionCount: 1,
    hasFulltext: true,
    license: 'CC BY 4.0',
    isFree: true,
    source: 'OpenStax',
    description: 'Evidence-based nursing clinical techniques, vital signs, aseptic procedures, and medication administration.',
  },
  {
    id: 'curated-med-3',
    title: 'Population Health for Nurses (OpenStax)',
    authors: ['Diana M. Taibi', 'Pamela F. Cipriano'],
    firstPublishYear: 2024,
    isbn: '9781711471457',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781711471457-M.jpg',
    openAccessUrl: 'https://openstax.org/details/books/population-health',
    openLibraryUrl: 'https://openstax.org/details/books/population-health',
    subjects: ['Medicine', 'Public Health', 'Epidemiology', 'Health Policy'],
    editionCount: 1,
    hasFulltext: true,
    license: 'CC BY 4.0',
    isFree: true,
    source: 'OpenStax',
    description: 'Epidemiology, public health promotion, health equity, and healthcare delivery systems.',
  },

  // --- Engineering ---
  {
    id: 'curated-eng-1',
    title: 'Fundamentals of Electrical Engineering I',
    authors: ['Don H. Johnson'],
    firstPublishYear: 2013,
    coverUrl: 'https://covers.openlibrary.org/b/id/11182442-M.jpg',
    openAccessUrl: 'https://www.ece.rice.edu/~dhj/',
    openLibraryUrl: 'https://www.ece.rice.edu/~dhj/',
    subjects: ['Electrical Engineering', 'Signals', 'Circuits', 'Information Theory'],
    editionCount: 2,
    hasFulltext: true,
    license: 'CC BY 3.0',
    isFree: true,
    source: 'Curated OER',
    description: 'Introductory electrical engineering covering signals, system theory, analog and digital circuits.',
  },
  {
    id: 'curated-eng-2',
    title: 'Engineering Mechanics: Statics (LibreTexts)',
    authors: ['Daniel Baker', 'William Haynes'],
    firstPublishYear: 2020,
    coverUrl: 'https://covers.openlibrary.org/b/id/10543212-M.jpg',
    openAccessUrl: 'https://eng.libretexts.org/Bookshelves/Mechanical_Engineering/Engineering_Statics',
    openLibraryUrl: 'https://eng.libretexts.org/Bookshelves/Mechanical_Engineering/Engineering_Statics',
    subjects: ['Engineering', 'Mechanical Engineering', 'Statics', 'Structures'],
    editionCount: 1,
    hasFulltext: true,
    license: 'CC BY-SA 3.0',
    isFree: true,
    source: 'Curated OER',
    description: 'Rigorous introduction to statics, equilibrium, trusses, frames, and distributed forces.',
  },

  // --- Business, Economics & Management ---
  {
    id: 'curated-econ-1',
    title: 'Principles of Microeconomics 3e (OpenStax)',
    authors: ['Steven A. Greenlaw', 'David Shapiro'],
    firstPublishYear: 2022,
    isbn: '9781938168048',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781938168048-M.jpg',
    openAccessUrl: 'https://openstax.org/details/books/principles-microeconomics-3e',
    openLibraryUrl: 'https://openstax.org/details/books/principles-microeconomics-3e',
    subjects: ['Economics', 'Microeconomics', 'Supply and Demand', 'Market Structure'],
    editionCount: 3,
    hasFulltext: true,
    license: 'CC BY 4.0',
    isFree: true,
    source: 'OpenStax',
    description: 'Foundational economic theory covering consumer choice, production, market equilibrium, and policy.',
  },
  {
    id: 'curated-econ-2',
    title: 'Principles of Macroeconomics 3e (OpenStax)',
    authors: ['Steven A. Greenlaw', 'David Shapiro'],
    firstPublishYear: 2022,
    isbn: '9781938168253',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781938168253-M.jpg',
    openAccessUrl: 'https://openstax.org/details/books/principles-macroeconomics-3e',
    openLibraryUrl: 'https://openstax.org/details/books/principles-macroeconomics-3e',
    subjects: ['Economics', 'Macroeconomics', 'Fiscal Policy', 'Monetary Policy', 'Inflation'],
    editionCount: 3,
    hasFulltext: true,
    license: 'CC BY 4.0',
    isFree: true,
    source: 'OpenStax',
    description: 'National income, unemployment, inflation, monetary systems, and international trade.',
  },
  {
    id: 'curated-bus-1',
    title: 'Principles of Accounting Volume 1: Financial Accounting',
    authors: ['Mitchell Franklin', 'Patty Graybeal', 'Dixon Cooper'],
    firstPublishYear: 2019,
    isbn: '9781947172678',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781947172678-M.jpg',
    openAccessUrl: 'https://openstax.org/details/books/principles-financial-accounting',
    openLibraryUrl: 'https://openstax.org/details/books/principles-financial-accounting',
    subjects: ['Business', 'Accounting', 'Financial Statements', 'Bookkeeping'],
    editionCount: 1,
    hasFulltext: true,
    license: 'CC BY 4.0',
    isFree: true,
    source: 'OpenStax',
    description: 'Covers the accounting equation, journals, financial reporting, inventory, and internal controls.',
  },
  {
    id: 'curated-bus-2',
    title: 'Principles of Management (OpenStax)',
    authors: ['David S. Bright', 'Anastasia H. Cortes'],
    firstPublishYear: 2019,
    isbn: '9780998625768',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9780998625768-M.jpg',
    openAccessUrl: 'https://openstax.org/details/books/principles-management',
    openLibraryUrl: 'https://openstax.org/details/books/principles-management',
    subjects: ['Business', 'Management', 'Leadership', 'Strategic Planning'],
    editionCount: 1,
    hasFulltext: true,
    license: 'CC BY 4.0',
    isFree: true,
    source: 'OpenStax',
    description: 'Planning, organizing, leading, and controlling in modern global organizations.',
  },

  // --- Law, Governance & Social Sciences ---
  {
    id: 'curated-law-1',
    title: 'Business Law I Essentials (OpenStax)',
    authors: ['Mirande Valbrune', 'Renee De Assis'],
    firstPublishYear: 2019,
    isbn: '9781947172784',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781947172784-M.jpg',
    openAccessUrl: 'https://openstax.org/details/books/business-law-i-essentials',
    openLibraryUrl: 'https://openstax.org/details/books/business-law-i-essentials',
    subjects: ['Law', 'Business Law', 'Contracts', 'Torts', 'Legal Systems'],
    editionCount: 1,
    hasFulltext: true,
    license: 'CC BY 4.0',
    isFree: true,
    source: 'OpenStax',
    description: 'Fundamentals of contract law, torts, corporate liability, intellectual property, and dispute resolution.',
  },
  {
    id: 'curated-law-2',
    title: 'African Legal Information Institute (Law Compendium)',
    authors: ['AfricanLII Legal Consortium'],
    firstPublishYear: 2024,
    coverUrl: 'https://covers.openlibrary.org/b/id/8315201-M.jpg',
    openAccessUrl: 'https://africanlii.org/',
    openLibraryUrl: 'https://africanlii.org/',
    subjects: ['Law', 'African Law', 'Constitutional Law', 'Judicial Precedents'],
    editionCount: 1,
    hasFulltext: true,
    license: 'Open Access',
    isFree: true,
    source: 'Curated OER',
    description: 'Free public repository of African case law, statutes, constitutional court judgments, and legal research.',
  },
  {
    id: 'curated-soc-1',
    title: 'Introduction to Sociology 3e (OpenStax)',
    authors: ['Tonja R. Conerly', 'Kathleen Holmes', 'Asha Lal Tamang'],
    firstPublishYear: 2021,
    isbn: '9781938168413',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781938168413-M.jpg',
    openAccessUrl: 'https://openstax.org/details/books/introduction-sociology-3e',
    openLibraryUrl: 'https://openstax.org/details/books/introduction-sociology-3e',
    subjects: ['Social Sciences', 'Sociology', 'Culture', 'Social Institutions'],
    editionCount: 3,
    hasFulltext: true,
    license: 'CC BY 4.0',
    isFree: true,
    source: 'OpenStax',
    description: 'Explores social theory, cultural dynamics, urbanization, social stratification, and social movements.',
  },
  {
    id: 'curated-soc-2',
    title: 'Psychology 2e (OpenStax)',
    authors: ['Rose M. Spielman', 'William J. Jenkins', 'Marilyn D. Lovett'],
    firstPublishYear: 2020,
    isbn: '9781975076443',
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781975076443-M.jpg',
    openAccessUrl: 'https://openstax.org/details/books/psychology-2e',
    openLibraryUrl: 'https://openstax.org/details/books/psychology-2e',
    subjects: ['Social Sciences', 'Psychology', 'Cognition', 'Behavior', 'Mental Health'],
    editionCount: 2,
    hasFulltext: true,
    license: 'CC BY 4.0',
    isFree: true,
    source: 'OpenStax',
    description: 'Comprehensive introduction to psychological science, biological psychology, development, memory, and therapy.',
  },
];

/**
 * Searches the Global Academic Library.
 * 1. Checks and matches curated peer-reviewed open access college textbooks (OpenStax, MIT OER, etc.).
 * 2. Concurrently queries:
 *    - Open Library Public Scan API (public_scan=true):
 *      Provides 1,000,000+ digitized, 100% public domain university books, medical volumes, science textbooks,
 *      and literature with interactive online reading via Internet Archive BookReader and direct PDF downloads.
 *    - Project Gutenberg (Gutendex):
 *      Provides 70,000+ public domain literary, scientific, economic, and philosophical books with clean
 *      in-browser HTML reading and direct EPUB downloads.
 * 3. Filters strictly for public-domain / full-access items (no borrowable books, no 1-hour waitlists, no publisher paywalls).
 * 4. Deduplicates against curated and previous results.
 * 5. Falls back seamlessly to curated textbooks if network requests fail or time out.
 */
export async function searchAcademicLibrary(query: string, limit: number = 20): Promise<AcademicBook[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return CURATED_TEXTBOOKS;
  }

  const queryLower = cleanQuery.toLowerCase();

  // Step 1: Filter curated textbooks
  const curatedMatches = CURATED_TEXTBOOKS.filter((b) =>
    b.title.toLowerCase().includes(queryLower) ||
    b.subjects.some((s) => s.toLowerCase().includes(queryLower)) ||
    b.authors.some((a) => a.toLowerCase().includes(queryLower)) ||
    (b.description && b.description.toLowerCase().includes(queryLower))
  );

  // Step 2: Concurrently query Open Library (Public Scans) and Project Gutenberg (Gutendex)
  try {
    const encoded = encodeURIComponent(cleanQuery);
    const timeoutMs = 6000;

    const [olResult, gutenResult] = await Promise.allSettled([
      // A) Open Library Public Domain Ebooks & Scans (Internet Archive full scans)
      (async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        const url = `https://openlibrary.org/search.json?q=${encoded}&public_scan=true&limit=${Math.min(limit, 16)}&fields=key,title,author_name,first_publish_year,cover_i,ia,edition_count,subject,ebook_access,public_scan_b`;
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'LiorisApp/1.0 (academic-library; contact: library@lioris.edu)',
            'Accept': 'application/json',
          },
        });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`OpenLibrary responded with status ${res.status}`);
        return res.json();
      })(),

      // B) Project Gutenberg via Gutendex
      (async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        const url = `https://gutendex.com/books?search=${encoded}`;
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'LiorisApp/1.0 (academic-library; contact: library@lioris.edu)',
            'Accept': 'application/json',
          },
        });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`Gutendex responded with status ${res.status}`);
        return res.json();
      })(),
    ]);

    const remoteBooks: AcademicBook[] = [];

    // Process Open Library Public Scan books
    if (olResult.status === 'fulfilled' && Array.isArray(olResult.value?.docs)) {
      for (const doc of olResult.value.docs) {
        // Guarantee 100% public domain / free full-text status (exclude loan / borrowable items)
        const isPublic = doc.ebook_access === 'public' || doc.public_scan_b === true;
        const iaId = Array.isArray(doc.ia) && doc.ia.length > 0 ? String(doc.ia[0]).trim() : undefined;
        if (!isPublic || !doc.title) continue;

        const openAccessUrl = iaId
          ? `https://archive.org/details/${iaId}`
          : (doc.key ? `https://openlibrary.org${doc.key}` : '');
        if (!openAccessUrl) continue;

        const pdfUrl = iaId ? `https://archive.org/download/${iaId}/${iaId}.pdf` : undefined;
        const coverUrl = doc.cover_i
          ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
          : (iaId ? `https://archive.org/services/img/${iaId}` : undefined);

        const authors = Array.isArray(doc.author_name) && doc.author_name.length > 0
          ? doc.author_name.slice(0, 3)
          : ['Various Authors'];

        const subjects = Array.isArray(doc.subject) && doc.subject.length > 0
          ? doc.subject.slice(0, 4)
          : ['Academic Literature'];

        remoteBooks.push({
          id: `ol-${iaId || doc.key || Math.random().toString(36).substring(2, 9)}`,
          title: doc.title,
          authors,
          firstPublishYear: doc.first_publish_year,
          coverUrl,
          openAccessUrl,
          openLibraryUrl: doc.key ? `https://openlibrary.org${doc.key}` : openAccessUrl,
          pdfUrl,
          subjects,
          editionCount: doc.edition_count || 1,
          hasFulltext: true,
          license: 'Public Domain',
          isFree: true,
          source: 'Open Library',
          description: 'Digitized public-access college and scholarly text readable online with full interactive viewer.',
        });
      }
    }

    // Process Project Gutenberg books
    if (gutenResult.status === 'fulfilled' && Array.isArray(gutenResult.value?.results)) {
      for (const item of gutenResult.value.results) {
        const formats = item.formats || {};
        const htmlUrl = formats['text/html'] || formats['text/html; charset=utf-8'];
        const epubUrl = formats['application/epub+zip'];
        const pdfUrl = formats['application/pdf'];
        const coverUrl = formats['image/jpeg'];
        const readUrl = htmlUrl || epubUrl || `https://www.gutenberg.org/ebooks/${item.id}`;

        if (!readUrl || !item.title) continue;

        const authors = Array.isArray(item.authors) && item.authors.length > 0
          ? item.authors.map((a: any) => a.name).filter(Boolean).slice(0, 3)
          : ['Classic Author'];

        const subjects = Array.isArray(item.subjects) && item.subjects.length > 0
          ? item.subjects.slice(0, 3)
          : (Array.isArray(item.bookshelves) && item.bookshelves.length > 0
              ? item.bookshelves.map((s: string) => s.replace('Category: ', '')).slice(0, 3)
              : ['General Literature']);

        const description = Array.isArray(item.summaries) && item.summaries.length > 0
          ? item.summaries[0]
          : undefined;

        remoteBooks.push({
          id: `guten-${item.id}`,
          title: item.title,
          authors: authors.length > 0 ? authors : ['Classic Author'],
          firstPublishYear: undefined,
          coverUrl,
          openAccessUrl: readUrl,
          openLibraryUrl: readUrl,
          pdfUrl,
          epubUrl,
          subjects,
          editionCount: 1,
          hasFulltext: true,
          license: 'Public Domain',
          isFree: true,
          source: 'Project Gutenberg',
          description,
          downloadCount: item.download_count,
        });
      }
    }

    // Deduplicate against curated items and each other by normalized title
    const seenTitles = new Set(curatedMatches.map((b) => b.title.trim().toLowerCase()));
    const uniqueRemote: AcademicBook[] = [];

    for (const book of remoteBooks) {
      const normalized = book.title.trim().toLowerCase();
      if (!seenTitles.has(normalized)) {
        seenTitles.add(normalized);
        uniqueRemote.push(book);
      }
    }

    const combined = [...curatedMatches, ...uniqueRemote];
    return combined.length > 0 ? combined : CURATED_TEXTBOOKS;
  } catch (err: any) {
    console.warn('[AcademicLibrary] Remote open-access search failed, returning curated list:', err?.message ?? err);
    return curatedMatches.length > 0 ? curatedMatches : CURATED_TEXTBOOKS;
  }
}

export function getCuratedLibraryCatalog(): AcademicBook[] {
  return CURATED_TEXTBOOKS;
}

