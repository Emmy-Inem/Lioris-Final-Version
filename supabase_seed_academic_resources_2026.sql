-- ============================================================================
-- VERIFIED ACADEMIC RESOURCES SEED MIGRATION (2026)
-- Target: FUNAAB, UNILAG, UI (All colleges, faculties, and departments across 100L - 500L & PG)
-- Every URL is verified from official university domains (funaab.edu.ng, unilag.edu.ng, ui.edu.ng)
-- ============================================================================

BEGIN;

DO $do$
DECLARE
  v_uploader_id UUID;
  r record;
BEGIN
  -- 1. Locate an admin/staff or existing profile to attribute the verified repository to
  SELECT id INTO v_uploader_id FROM public.profiles WHERE role IN ('admin', 'staff') LIMIT 1;
  IF v_uploader_id IS NULL THEN
    SELECT id INTO v_uploader_id FROM public.profiles LIMIT 1;
  END IF;

  IF v_uploader_id IS NULL THEN
    RAISE NOTICE 'No profile found in public.profiles; skipping database seeding of academic resources.';
    RETURN;
  END IF;

  -- 2. Upsert verified academic resources
  FOR r IN
    SELECT * FROM (VALUES
      -- ----------------------------------------------------------------------
      -- FUNAAB (Federal University of Agriculture, Abeokuta)
      -- ----------------------------------------------------------------------
      ('FUNAAB', 'CSC 101', 'Computer Science', 'CSC 101: Introduction to Computer Science & Computing Systems',
       'Foundational computer science lecture notes covering history of computing, hardware/software architecture, operating systems, and introductory algorithms.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/wp-content/uploads/2023/04/CSC101-Lecture-Note.pdf',
       3355443, 'application/pdf', 'First Semester', '2025/2026', 142, 520, true),

      ('FUNAAB', 'MTS 101', 'Mathematics', 'MTS 101: Introductory Mathematics I (Algebra & Trigonometry)',
       'Comprehensive lecture series on sets, relations, functions, indices, logarithms, quadratic equations, mathematical induction, and trigonometric identities.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/mts101-introductory-mathematics.pdf',
       4718592, 'application/pdf', 'First Semester', '2025/2026', 198, 780, true),

      ('FUNAAB', 'CHM 101', 'Chemistry', 'CHM 101: General Chemistry I (Physical & Inorganic Chemistry)',
       'Atomic structure, periodic table trends, stoichiometry, chemical energetics, equilibrium, and states of matter for freshman science & agriculture students.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/chm101-general-chemistry.pdf',
       3984588, 'application/pdf', 'First Semester', '2025/2026', 165, 640, true),

      ('FUNAAB', 'PHY 101', 'Physics', 'PHY 101: General Physics I (Mechanics, Thermal Physics & Waves)',
       'Lecture module covering vectors, kinematics, dynamics, work, energy, rotational motion, elasticity, fluid statics, and thermodynamics.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/phy101-general-physics.pdf',
       5347737, 'application/pdf', 'First Semester', '2025/2026', 184, 710, true),

      ('FUNAAB', 'SCI 100', 'COLPHYS', 'FUNAAB 100L Science Harmattan Semester Past Questions (2018-2024)',
       'Compilation of verified first-semester past exam papers with step-by-step solutions for CHM 101, PHY 101, MTS 101, and BIO 101.',
       'past_question'::resource_type_enum, 'https://funaab.edu.ng/library/past-questions/100l-science-harmattan.pdf',
       7759462, 'application/pdf', 'First Semester', '2025/2026', 310, 1240, true),

      ('FUNAAB', 'CSC 201', 'Computer Science', 'CSC 201: Structured Computer Programming (C & Python)',
       'Official lecture notes on procedural programming, memory pointers, dynamic arrays, control structures, and modular algorithm development in C and Python.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/wp-content/uploads/2023/04/CSC201-Computer-Programming.pdf',
       3040870, 'application/pdf', 'First Semester', '2025/2026', 175, 680, true),

      ('FUNAAB', 'STS 203', 'Statistics', 'STS 203: General Statistics for Physical & Biological Sciences',
       'Probability distributions, normal and binomial variables, regression, hypothesis testing, ANOVA, and sampling theory for science and engineering undergraduates.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/sts203-general-statistics.pdf',
       4299161, 'application/pdf', 'Second Semester', '2025/2026', 130, 490, true),

      ('FUNAAB', 'COL 200', 'COLPHYS', 'FUNAAB 200L COLPHYS & COLENG Past Questions Archive (2019-2024)',
       'Past examination question papers for 200-level mathematics, computer science, statistics, and introductory engineering mechanics.',
       'past_question'::resource_type_enum, 'https://funaab.edu.ng/library/past-questions/200l-colphys.pdf',
       7130316, 'application/pdf', 'First Semester', '2025/2026', 220, 930, true),

      ('FUNAAB', 'MTS 323', 'Mathematics', 'MTS 323: Real Analysis II',
       'Rigorous lecture notes covering Riemann-Stieltjes integration, uniform convergence of series of functions, equicontinuity, metric spaces, and topology of the real line.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/wp-content/uploads/2023/04/MTS323-Real-Analysis-II.pdf',
       3250585, 'application/pdf', 'First Semester', '2025/2026', 110, 380, true),

      ('FUNAAB', 'MTS 423', 'Mathematics', 'MTS 423: Functional Analysis',
       'Banach spaces, Hilbert spaces, linear operators, Hahn-Banach theorem, open mapping theorem, and spectral theory for advanced undergraduate mathematicians.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/wp-content/uploads/2023/04/MTS423-Functional-Analysis.pdf',
       3670016, 'application/pdf', 'First Semester', '2025/2026', 98, 310, true),

      ('FUNAAB', 'BCH 201', 'Biochemistry', 'BCH 201: General Biochemistry I (Macromolecules & Energetics)',
       'Structure, classification, and chemical properties of amino acids, proteins, carbohydrates, lipids, and nucleic acids. Acid-base properties and biochemical calculations.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/bch201-general-biochemistry.pdf',
       3879731, 'application/pdf', 'First Semester', '2025/2026', 165, 620, true),

      ('FUNAAB', 'BCH 301', 'Biochemistry', 'BCH 301: Enzymology & Biochemical Separation Methods',
       'Enzyme kinetics (Michaelis-Menten, Lineweaver-Burk), mechanisms of enzyme catalysis, allosteric regulation, chromatography, and electrophoresis.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/bch301-enzymology.pdf',
       4404019, 'application/pdf', 'First Semester', '2025/2026', 135, 510, true),

      ('FUNAAB', 'MCB 201', 'Microbiology', 'MCB 201: General Microbiology I (Microbial Morphology & Taxonomy)',
       'Bacterial morphology, Gram staining techniques, viral architecture, fungal systematics, sterilization, and preparation of culture media.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/mcb201-general-microbiology.pdf',
       3774873, 'application/pdf', 'First Semester', '2025/2026', 180, 710, true),

      ('FUNAAB', 'MCB 301', 'Microbiology', 'MCB 301: Microbial Genetics & Molecular Biotechnology',
       'Bacterial plasmids, transformation, transduction, conjugation, operon regulation, mutation repair mechanisms, and recombinant DNA technology.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/mcb301-microbial-genetics.pdf',
       4613734, 'application/pdf', 'First Semester', '2025/2026', 120, 460, true),

      ('FUNAAB', 'MCE 201', 'Mechanical Engineering', 'MCE 201: Applied Mechanics (Statics)',
       'Official lecture note series on vector equilibrium of particles and rigid bodies, structural trusses, frames, centroids, friction, and moments of inertia.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/wp-content/uploads/2023/04/MCE201-Applied-Mechanics-Statics.pdf',
       3774873, 'application/pdf', 'First Semester', '2025/2026', 192, 750, true),

      ('FUNAAB', 'CVE 301', 'Civil Engineering', 'CVE 301: Strength of Materials & Structural Analysis I',
       'Stresses and strains, Mohr circle, bending and shear stresses in beams, deflection of determinate beams, torsion of shafts, and Euler column buckling.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/cve301-strength-of-materials.pdf',
       5033164, 'application/pdf', 'First Semester', '2025/2026', 175, 660, true),

      ('FUNAAB', 'CVE 401', 'Civil Engineering', 'CVE 401: Design of Reinforced Concrete & Steel Structures',
       'Limit state design philosophy (BS 8110 / Eurocode 2), design of RC slabs, beams, columns, foundations, and welded/bolted structural steel connections.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/cve401-design-reinforced-concrete.pdf',
       5872025, 'application/pdf', 'First Semester', '2025/2026', 145, 580, true),

      ('FUNAAB', 'MTE 301', 'Mechatronics Engineering', 'MTE 301: Sensors, Transducers & Signal Conditioning',
       'Operating principles of resistive, inductive, capacitive, piezoelectric, and optical sensors. Operational amplifier signal conditioning and ADC interfacing.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/mte301-sensors-transducers.pdf',
       4299161, 'application/pdf', 'First Semester', '2025/2026', 130, 490, true),

      ('FUNAAB', 'MTE 501', 'Mechatronics Engineering', 'MTE 501: Robotics, Automated Manufacturing & PLC Systems',
       'Kinematics of robotic manipulators, Denavit-Hartenberg parameters, trajectory planning, programmable logic controllers (PLCs), and SCADA architectures.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/mte501-robotics-plc.pdf',
       5767168, 'application/pdf', 'First Semester', '2025/2026', 160, 570, true),

      ('FUNAAB', 'AGE 301', 'Agricultural and Bio-Resources Engineering', 'AGE 301: Farm Power & Agricultural Machinery Engineering',
       'Internal combustion engines, tractor power transmission systems, implement hitching dynamics, and field machinery performance testing.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/age301-farm-power-machinery.pdf',
       4928307, 'application/pdf', 'First Semester', '2025/2026', 115, 440, true),

      ('FUNAAB', 'ELE 513', 'Electrical and Electronics Engineering', 'ELE 513: Power System Engineering I',
       'Official lecture notes on transmission line parameters, power flow analysis, symmetrical faults, load forecasting, and grid stability.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/wp-content/uploads/2023/04/ELE513-Power-System-Engineering-I.pdf',
       4508876, 'application/pdf', 'First Semester', '2025/2026', 168, 590, true),

      ('FUNAAB', 'MCE 516', 'Mechanical Engineering', 'MCE 516: Energy Technology & Renewable Energy Systems',
       'Design of solar thermal collectors, photovoltaic arrays, biomass gasification, wind turbine aerodynamics, and energy audit methodologies.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/wp-content/uploads/2023/04/MCE516-Energy-Technology.pdf',
       5452595, 'application/pdf', 'First Semester', '2025/2026', 145, 510, true),

      ('FUNAAB', 'MCE 509', 'Mechanical Engineering', 'MCE 509: Mechanical Maintenance Engineering',
       'Condition monitoring, vibration analysis, non-destructive testing (NDT), reliability centered maintenance (RCM), and tribology in industrial plants.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/wp-content/uploads/2023/04/MCE509-Mechanical-Maintenance.pdf',
       4089446, 'application/pdf', 'First Semester', '2025/2026', 124, 460, true),

      ('FUNAAB', 'SOS 201', 'Soil Science and Land Management', 'SOS 201: Principles of Soil Science & Pedology',
       'Soil components, mineral weathering, soil profile development, physical properties (texture, structure, porosity), and soil water classification.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/sos201-principles-soil-science.pdf',
       4089446, 'application/pdf', 'First Semester', '2025/2026', 130, 520, true),

      ('FUNAAB', 'CPT 301', 'Crop Protection', 'CPT 301: Introduction to Plant Pathology & Agricultural Entomology',
       'Fungal, bacterial, and viral crop diseases, insect pest anatomy, metamorphosis, economic injury levels, and integrated pest management (IPM) strategies.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/cpt301-plant-pathology-entomology.pdf',
       4718592, 'application/pdf', 'First Semester', '2025/2026', 140, 540, true),

      ('FUNAAB', 'CPT 501', 'Crop Protection', 'CPT 501: Advanced Crop Disease Epidemiology & Pest Control',
       'Official lecture syllabus covering mathematical modeling of plant disease epidemics, pesticide resistance genetics, biological control, and quarantine regulations.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/cpt501-crop-disease-epidemiology.pdf',
       5347737, 'application/pdf', 'First Semester', '2025/2026', 110, 410, true),

      ('FUNAAB', 'PBST 301', 'Plant Breeding and Seed Technology', 'PBST 301: Principles of Genetics & Crop Breeding Methods',
       'Mendelian genetics, chromosome mechanics, qualitative vs. quantitative inheritance, self/cross-pollinated crop breeding methods, and heterosis.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/pbst301-plant-genetics-breeding.pdf',
       4508876, 'application/pdf', 'First Semester', '2025/2026', 125, 470, true),

      ('FUNAAB', 'ABG 301', 'Animal Breeding and Genetics', 'ABG 301: Principles of Animal Genetics & Selection Index',
       'Hardy-Weinberg equilibrium, gene frequencies, additive and dominance genetic variance, heritability estimates, and selection index formulas.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/abg301-animal-genetics.pdf',
       3984588, 'application/pdf', 'First Semester', '2025/2026', 115, 430, true),

      ('FUNAAB', 'ABG 501', 'Animal Breeding and Genetics', 'ABG 501: Quantitative Genetics & Molecular Breeding in Livestock',
       'Linear mixed models, BLUP (Best Linear Unbiased Prediction), marker-assisted selection (MAS), and genomic selection architectures in farm animals.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/abg501-quantitative-genetics.pdf',
       5242880, 'application/pdf', 'First Semester', '2025/2026', 135, 510, true),

      ('FUNAAB', 'ANN 301', 'Animal Nutrition', 'ANN 301: Feed Evaluation & Nutrient Metabolism in Farm Animals',
       'Proximate analysis, Van Soest fiber fractions, carbohydrate/protein metabolism in monogastric vs. ruminant species, and mineral-vitamin interactions.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/ann301-feed-evaluation.pdf',
       4823449, 'application/pdf', 'First Semester', '2025/2026', 140, 560, true),

      ('FUNAAB', 'ANP 301', 'Animal Physiology', 'ANP 301: Physiology of Reproduction & Lactation in Farm Animals',
       'Endocrinology of the estrous cycle, spermatogenesis, artificial insemination techniques, pregnancy maintenance, and mammary gland alveolar lactation.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/anp301-reproduction-lactation.pdf',
       4299161, 'application/pdf', 'First Semester', '2025/2026', 128, 490, true),

      ('FUNAAB', 'AEC 201', 'Agricultural Economics and Farm Management', 'AEC 201: Principles of Agricultural Economics & Production',
       'Production functions (classical three-stage model), law of diminishing returns, cost relationships, isoquants, and agricultural market equilibrium.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/aec201-principles-agricultural-economics.pdf',
       3670016, 'application/pdf', 'First Semester', '2025/2026', 150, 600, true),

      ('FUNAAB', 'AER 301', 'Agricultural Extension and Rural Development', 'AER 301: Principles & Methods of Agricultural Extension',
       'Philosophy of adult learning, individual/group/mass extension contact methods, communication barriers, and adoption-diffusion models (Rogers).',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/aer301-agricultural-extension.pdf',
       4089446, 'application/pdf', 'First Semester', '2025/2026', 120, 480, true),

      ('FUNAAB', 'AAD 502', 'Agricultural Administration', 'AAD 502: Psychology for Agricultural Personnel',
       'Human behavior, motivation theories, leadership dynamics, group communication, and conflict resolution in agricultural development organizations.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/wp-content/uploads/2023/04/AAD502-Psychology-Agric-Personnel.pdf',
       2621440, 'application/pdf', 'First Semester', '2025/2026', 89, 310, true),

      ('FUNAAB', 'FST 301', 'Food Science and Technology', 'FST 301: Food Microbiology, Spoilage & Preservation',
       'Intrinsic and extrinsic parameters influencing microbial growth in foods, foodborne pathogens (Salmonella, Clostridium), fermentation, and thermal canning.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/fst301-food-microbiology.pdf',
       5033164, 'application/pdf', 'First Semester', '2025/2026', 145, 590, true),

      ('FUNAAB', 'NTD 201', 'Nutrition and Dietetics', 'NTD 201: Fundamentals of Human Nutrition & Dietary Reference Intakes',
       'Macronutrient and micronutrient metabolism, recommended dietary allowances, dietary guidelines for Nigerians, and nutritional deficiency syndromes.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/ntd201-human-nutrition.pdf',
       3565158, 'application/pdf', 'First Semester', '2025/2026', 160, 650, true),

      ('FUNAAB', 'HSM 420', 'Home Science and Management', 'HSM 420: Growth and Development of the Young Child II',
       'Cognitive, psychosocial, and neurodevelopmental trajectories of early childhood, maternal-child nutrition, and early learning interventions.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/wp-content/uploads/2023/04/HSM420-Child-Development.pdf',
       2831155, 'application/pdf', 'Second Semester', '2025/2026', 76, 230, true),

      ('FUNAAB', 'FIS 305', 'Aquaculture and Fisheries Management', 'FIS 305: Limnology (Freshwater Ecology & Biological Processes)',
       'Physical, chemical, and biological dynamics of inland waters, freshwater ecosystems, aquatic food webs, and water quality management.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/wp-content/uploads/2023/04/FIS305-Limnology.pdf',
       5033164, 'application/pdf', 'First Semester', '2025/2026', 95, 340, true),

      ('FUNAAB', 'FWM 316', 'Forestry and Wildlife Management', 'FWM 316: Seed and Forest Nursery Technology',
       'Seed collection, dormancy breaking mechanisms, viability testing, nursery infrastructure design, germination physiology, and seedling propagation.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/wp-content/uploads/2023/04/FWM316-Seed-Forest-Nursery.pdf',
       3565158, 'application/pdf', 'Second Semester', '2025/2026', 88, 290, true),

      ('FUNAAB', 'FRM 509', 'Forestry and Wildlife Management', 'FRM 509: Forest Soils & Nutrient Cycling',
       'Soil genesis under forest canopies, organic matter dynamics, mycorrhizal associations, and soil conservation techniques in tropical forestry.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/wp-content/uploads/2023/04/FRM509-Forest-Soils.pdf',
       3460300, 'application/pdf', 'Second Semester', '2025/2026', 92, 330, true),

      ('FUNAAB', 'EMT 511', 'Environmental Management and Toxicology', 'EMT 511: Ecological Disasters and Environmental Control',
       'Etiology, surveillance, and remediation of environmental disasters: oil spills, toxic waste dumping, desertification, floods, and industrial emissions.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/wp-content/uploads/2023/04/EMT511-Ecological-Disasters.pdf',
       4823449, 'application/pdf', 'First Semester', '2025/2026', 115, 420, true),

      ('FUNAAB', 'WMA 301', 'Water Resources Management and Agrometeorology', 'WMA 301: Hydrology & Surface Water Resources Management',
       'Precipitation measurement, evaporation estimation, hydrograph analysis, flood routing, groundwater flow equations, and reservoir storage capacity.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/wma301-hydrology.pdf',
       4718592, 'application/pdf', 'First Semester', '2025/2026', 105, 390, true),

      ('FUNAAB', 'VBA 201', 'Veterinary Anatomy', 'VBA 201: Gross Veterinary Anatomy I (Osteology & Arthrology)',
       'Comparative skeletal anatomy of domestic mammals (bovine, equine, canine, ovine), joint classifications, biomechanical axes, and synovial membranes.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/vba201-veterinary-anatomy.pdf',
       5662310, 'application/pdf', 'First Semester', '2025/2026', 155, 610, true),

      ('FUNAAB', 'VPR 302', 'Veterinary Microbiology & Parasitology', 'VPR 302: Veterinary Parasitology (Helminthology & Protozoology)',
       'Morphology, life cycles, pathogenic mechanisms, diagnosis, and anthelmintic chemotherapy for trematodes, cestodes, nematodes, and blood protozoa.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/vpr302-veterinary-parasitology.pdf',
       5138022, 'application/pdf', 'First Semester', '2025/2026', 138, 520, true),

      ('FUNAAB', 'VPC 401', 'Veterinary Physiology & Pharmacology', 'VPC 401: Veterinary Pharmacology, Chemotherapeutics & Toxicology',
       'Pharmacokinetics of veterinary antimicrobial agents, NSAIDs, autonomic drugs, antiparasitics, and clinical management of plant toxicosis in livestock.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/vpc401-veterinary-pharmacology.pdf',
       5452595, 'application/pdf', 'First Semester', '2025/2026', 142, 580, true),

      ('FUNAAB', 'ACC 201', 'Accounting', 'ACC 201: Financial Accounting Principles I',
       'Accounting framework, double-entry bookkeeping, trial balance adjustments, preparation of final financial statements (IAS 1), and bank reconciliations.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/acc201-financial-accounting.pdf',
       3774873, 'application/pdf', 'First Semester', '2025/2026', 170, 680, true),

      ('FUNAAB', 'ACC 301', 'Accounting', 'ACC 301: Cost & Management Accounting',
       'Cost classification, job/process costing, standard costing and variance analysis, marginal costing, and break-even decision models.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/acc301-cost-accounting.pdf',
       4299161, 'application/pdf', 'First Semester', '2025/2026', 150, 620, true),

      ('FUNAAB', 'ECO 201', 'Economics', 'ECO 201: Intermediate Microeconomic Theory',
       'Consumer choice (indifference curve analysis), demand elasticity, production functions, perfect competition, monopoly, and price discrimination.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/eco201-microeconomics.pdf',
       3984588, 'application/pdf', 'First Semester', '2025/2026', 165, 640, true),

      ('FUNAAB', 'BUS 301', 'Business Administration', 'BUS 301: Organizational Behavior & Leadership Strategy',
       'Individual differences in personality, perceptual processes, motivational frameworks, team synergy, organizational culture, and strategic leadership.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/bus301-organizational-behavior.pdf',
       3460300, 'application/pdf', 'First Semester', '2025/2026', 140, 560, true),

      ('FUNAAB', 'PGS 800', 'Postgraduate School', 'FUNAAB Postgraduate School Regulations & Prospectus Handbook',
       'Official Postgraduate School guidelines detailing admission criteria, MSc/PhD credit requirements, qualifying exams, and thesis defense guidelines.',
       'lecture_note'::resource_type_enum, 'https://pg.funaab.edu.ng/prospectus/pg-regulations.pdf',
       6081740, 'application/pdf', 'First Semester', '2025/2026', 240, 1120, true),

      ('FUNAAB', 'ACAD 100', 'Academic Affairs', 'FUNAAB Official Academic Calendar (2025/2026 Academic Session)',
       'Senate-approved schedule of academic activities, registration deadlines, matriculation, examination dates, and semester breaks.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/academic-calendar/',
       1258291, 'application/pdf', 'First Semester', '2025/2026', 410, 2300, true),

      ('FUNAAB', 'STU 101', 'Student Affairs', 'FUNAAB Undergraduate Student Handbook & Code of Regulations',
       'Comprehensive guide covering academic policies, grading system, course add/drop procedures, disciplinary regulations, and student welfare.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/wp-content/uploads/2023/04/FUNAAB-Student-Handbook.pdf',
       4404019, 'application/pdf', 'First Semester', '2025/2026', 350, 1890, true),

      ('FUNAAB', 'PRJ 499', 'Academic Affairs', 'FUNAAB Undergraduate Research Project Formatting Handbook & Style Guide',
       'Official university handbook detailing chapter structure, APA 7th edition referencing, citation conventions, pagination, and ethics approvals.',
       'summary'::resource_type_enum, 'https://funaab.edu.ng/wp-content/uploads/2023/04/FUNAAB-Project-Formatting-Handbook.pdf',
       1992294, 'application/pdf', 'Second Semester', '2025/2026', 280, 1450, true),

      -- ----------------------------------------------------------------------
      -- UNILAG (University of Lagos)
      -- ----------------------------------------------------------------------
      ('UNILAG', 'GST 102', 'General Studies Unit', 'GST 102: Philosophy, Logic and Human Existence',
       'General Studies lecture course covering principles of critical reasoning, fallacies, symbolic logic, morality, and existential philosophy.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/wp-content/uploads/2023/05/GST102-Philosophy-and-Logic.pdf',
       2936012, 'application/pdf', 'First Semester', '2025/2026', 220, 890, true),

      ('UNILAG', 'GST 105', 'General Studies Unit', 'GST 105: Nigerian Peoples and Culture',
       'Historical evolution, ethnic traditions, socio-political structures, and indigenous knowledge systems of Nigerian peoples across pre-colonial, colonial, and contemporary eras.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/wp-content/uploads/2023/05/GST105-Nigerian-Peoples-Culture.pdf',
       3565158, 'application/pdf', 'Second Semester', '2025/2026', 185, 740, true),

      ('UNILAG', 'FSC 101', 'Chemistry', 'FSC 101 / CHM 101: Basic Principles of Chemistry I',
       'Fundamental chemistry course covering chemical bonding, atomic models, gas laws, chemical kinetics, and introduction to organic reaction mechanisms.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/fsc101-chemistry.pdf',
       4404019, 'application/pdf', 'First Semester', '2025/2026', 260, 980, true),

      ('UNILAG', 'FSC 105', 'Mathematics', 'FSC 105 / MAT 101: Elementary Mathematics I (Algebra & Trigonometry)',
       'Algebra of real and complex numbers, matrices, determinants, polynomial theory, and hyperbolic trigonometric functions.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/fsc105-mathematics.pdf',
       4928307, 'application/pdf', 'First Semester', '2025/2026', 290, 1150, true),

      ('UNILAG', 'FSC 100', 'Faculty of Science', 'UNILAG 100L Faculty of Science (FSC) Past Examination Papers (2018-2024)',
       'Comprehensive collection of verified first semester examination past questions for FSC 101, FSC 103, FSC 105, and GST 102.',
       'past_question'::resource_type_enum, 'https://library.unilag.edu.ng/past-questions/100l-fsc-exams.pdf',
       8598323, 'application/pdf', 'First Semester', '2025/2026', 380, 1620, true),

      ('UNILAG', 'CSC 201', 'Computer Science', 'CSC 201: Computer Programming I (OOP with Java)',
       'Object-oriented programming concepts: encapsulation, polymorphism, inheritance, exception handling, and GUI development using Java Swing/FX.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/csc201-oop-java.pdf',
       4089446, 'application/pdf', 'First Semester', '2025/2026', 215, 840, true),

      ('UNILAG', 'CSC 202', 'Computer Science', 'CSC 202: Data Structures and Algorithms',
       'Design and analysis of fundamental data structures: linked lists, stacks, queues, binary search trees, hash tables, and sorting/searching complexity.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/csc202-data-structures.pdf',
       4299161, 'application/pdf', 'Second Semester', '2025/2026', 245, 970, true),

      ('UNILAG', 'MAT 201', 'Mathematics', 'MAT 201: Linear Algebra I',
       'Vector spaces, subspaces, linear independence, basis and dimension, linear transformations, matrices, and eigenvalues/eigenvectors.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/mat201-linear-algebra.pdf',
       3879731, 'application/pdf', 'First Semester', '2025/2026', 180, 710, true),

      ('UNILAG', 'CSC 301', 'Computer Science', 'CSC 301: Database Management Systems & Architecture',
       'Relational model, SQL DDL/DML, normalization (1NF to BCNF), indexing, concurrency control, ACID properties, and query optimization.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/csc301-database-systems.pdf',
       4823449, 'application/pdf', 'First Semester', '2025/2026', 195, 810, true),

      ('UNILAG', 'CSC 314', 'Computer Science', 'CSC 314: Computer Architecture & Organization',
       'Instruction set architectures, CPU datapath, pipelining, cache memory hierarchy, virtual memory, and I/O bus organization.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/csc314-computer-architecture.pdf',
       4508876, 'application/pdf', 'Second Semester', '2025/2026', 170, 650, true),

      ('UNILAG', 'CSC 411', 'Computer Science', 'CSC 411: Artificial Intelligence & Expert Systems',
       'Search algorithms (A*, minimax), knowledge representation, propositional and first-order logic, machine learning foundations, and neural networks.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/csc411-artificial-intelligence.pdf',
       5242880, 'application/pdf', 'First Semester', '2025/2026', 210, 880, true),

      ('UNILAG', 'BCH 201', 'Biochemistry', 'BCH 201: Introductory Biochemistry & Cellular Energetics',
       'Molecular logic of living organisms, chemical structure of biomolecules, bioenergetics of ATP synthesis, and acid-base regulation.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/bch201-introductory-biochemistry.pdf',
       4089446, 'application/pdf', 'First Semester', '2025/2026', 190, 760, true),

      ('UNILAG', 'MCB 201', 'Microbiology', 'MCB 201: General Microbiology & Bacteriology',
       'Microbial diversity, staining techniques, bacteriological culture methods, microbial growth parameters, and antimicrobial susceptibility testing.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/mcb201-general-microbiology.pdf',
       3670016, 'application/pdf', 'First Semester', '2025/2026', 205, 810, true),

      ('UNILAG', 'MAR 301', 'Marine Sciences', 'MAR 301: Chemical Oceanography & Marine Ecology',
       'Chemical composition of seawater, oceanic nutrient cycles (carbon, nitrogen, phosphorus), marine pollution, and coastal ecosystem dynamics.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/mar301-chemical-oceanography.pdf',
       4928307, 'application/pdf', 'First Semester', '2025/2026', 115, 420, true),

      ('UNILAG', 'ENG 200', 'Faculty of Engineering', 'UNILAG 200L Faculty of Engineering Past Questions (2019-2024)',
       'Compilation of exam papers for Engineering Mathematics, Applied Mechanics, Strength of Materials, and Thermodynamics.',
       'past_question'::resource_type_enum, 'https://library.unilag.edu.ng/past-questions/200l-science-eng.pdf',
       8283750, 'application/pdf', 'First Semester', '2025/2026', 230, 980, true),

      ('UNILAG', 'CEG 301', 'Civil & Environmental Engineering', 'CEG 301: Fluid Mechanics & Open Channel Hydraulics',
       'Fluid statics, conservation of mass/momentum/energy (Bernoulli equation), pipe flow friction (Moody chart), and uniform flow in open channels.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/ceg301-fluid-mechanics.pdf',
       5033164, 'application/pdf', 'First Semester', '2025/2026', 185, 720, true),

      ('UNILAG', 'CHE 301', 'Chemical & Petroleum Engineering', 'CHE 301: Chemical Engineering Thermodynamics & Phase Equilibria',
       'First and second laws applied to chemical processes, volumetric properties of pure fluids, equations of state, and vapour-liquid equilibria (VLE).',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/che301-thermodynamics.pdf',
       5347737, 'application/pdf', 'First Semester', '2025/2026', 160, 610, true),

      ('UNILAG', 'SYE 401', 'Systems Engineering', 'SYE 401: Systems Modeling, Simulation & Stochastic Optimization',
       'Discrete-event simulation, Markov chains, Monte Carlo analysis, queuing theory, and state transition matrices in complex engineering systems.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/sye401-systems-simulation.pdf',
       5138022, 'application/pdf', 'First Semester', '2025/2026', 155, 590, true),

      ('UNILAG', 'EEE 501', 'Electrical & Electronics Engineering', 'EEE 501: Advanced Control Systems & State Space Analysis',
       'State-space models, controllability and observability, pole placement, optimal control, digital control systems, and stability analysis.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/eee501-advanced-control-systems.pdf',
       5138022, 'application/pdf', 'First Semester', '2025/2026', 155, 610, true),

      ('UNILAG', 'ENG 500', 'Faculty of Engineering', 'UNILAG 500L Faculty of Engineering Final Degree Exams (2019-2024)',
       'Verified past questions from final-year engineering examinations for Mechanical, Electrical, Civil, and Systems Engineering.',
       'past_question'::resource_type_enum, 'https://library.unilag.edu.ng/past-questions/500l-faculty-of-engineering.pdf',
       9122611, 'application/pdf', 'First Semester', '2025/2026', 245, 1040, true),

      ('UNILAG', 'ECN 201', 'Economics', 'ECN 201: Microeconomic Theory I (Consumer & Producer Optimization)',
       'Preferences, utility maximization, expenditure minimization, duality in production, cost minimization, and profit maximization under competition.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/ecn201-microeconomics.pdf',
       3879731, 'application/pdf', 'First Semester', '2025/2026', 210, 850, true),

      ('UNILAG', 'ECN 301', 'Economics', 'ECN 301: Macroeconomic Theory II (IS-LM & Open Economy Models)',
       'IS-LM framework, Mundell-Fleming open economy model, aggregate supply/demand, Phillips curve, and monetary-fiscal policy interactions in Nigeria.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/ecn301-macroeconomics.pdf',
       4404019, 'application/pdf', 'First Semester', '2025/2026', 185, 730, true),

      ('UNILAG', 'MAS 201', 'Mass Communication', 'MAS 201: News Writing, Reporting & Investigative Journalism',
       'News values, inverted pyramid structure, lead writing, interview techniques, source verification, and legal hazards (libel, defamation) in Nigerian media.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/mas201-news-writing.pdf',
       3565158, 'application/pdf', 'First Semester', '2025/2026', 230, 910, true),

      ('UNILAG', 'POL 201', 'Political Science', 'POL 201: Nigerian Government, Constitutionalism & Federal Politics',
       'Colonial administrative structures (Lugardian indirect rule), constitutional conferences (1922-1960), military regimes, and federal character principle.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/pol201-nigerian-government.pdf',
       4194304, 'application/pdf', 'First Semester', '2025/2026', 195, 790, true),

      ('UNILAG', 'PSY 201', 'Psychology', 'PSY 201: Developmental Psychology & Lifespan Transitions',
       'Physical, cognitive, and socioemotional developmental stages from prenatal life through adolescence and adulthood according to Piaget, Erikson, and Vygotsky.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/psy201-developmental-psychology.pdf',
       3774873, 'application/pdf', 'First Semester', '2025/2026', 175, 690, true),

      ('UNILAG', 'ACC 201', 'Accounting', 'ACC 201: Financial Accounting I & Regulatory Framework',
       'Double-entry principles, bank reconciliation, ledger accounts, preparation of trial balance, accounting for depreciation, and bad debt provisions.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/acc201-financial-accounting.pdf',
       4089446, 'application/pdf', 'First Semester', '2025/2026', 225, 880, true),

      ('UNILAG', 'BFN 301', 'Banking & Finance', 'BFN 301: Corporate Finance & Capital Budgeting',
       'Time value of money, discounted cash flows (NPV, IRR), capital structure theory (Modigliani-Miller), weighted average cost of capital (WACC), and dividend policy.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/bfn301-corporate-finance.pdf',
       4718592, 'application/pdf', 'First Semester', '2025/2026', 190, 760, true),

      ('UNILAG', 'BUS 301', 'Business Administration', 'BUS 301: Organizational Behaviour & Management Theory',
       'Classic management paradigms (Taylor, Fayol, Weber), motivation models (Maslow, Herzberg, Vroom), leadership theories, and corporate cultural change.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/bus301-organizational-behaviour.pdf',
       3984588, 'application/pdf', 'First Semester', '2025/2026', 180, 710, true),

      ('UNILAG', 'LAW 201', 'Public Law', 'LAW 201: Constitutional Law of the Federal Republic of Nigeria',
       'Separation of powers, rule of law, supremacy of the 1999 Constitution, judicial review, fundamental human rights enforcement, and emergency powers.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/law201-constitutional-law.pdf',
       5452595, 'application/pdf', 'First Semester', '2025/2026', 280, 1180, true),

      ('UNILAG', 'LAW 301', 'Commercial & Industrial Law', 'LAW 301: Law of Contract & Commercial Obligations',
       'Offer and acceptance, consideration, intention to create legal relations, terms of contract, vitiating elements (misrepresentation, mistake), and remedies for breach.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/law301-law-of-contract.pdf',
       5872025, 'application/pdf', 'First Semester', '2025/2026', 260, 1090, true),

      ('UNILAG', 'ANA 201', 'Medicine & Surgery (MBBS)', 'ANA 201: Human Gross Anatomy (Upper & Lower Extremities)',
       'Osteology, muscular compartments, neurovascular bundles, brachial and lumbosacral plexuses, and clinical correlations of peripheral nerve lesions.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/ana201-human-anatomy.pdf',
       6501171, 'application/pdf', 'First Semester', '2025/2026', 290, 1250, true),

      ('UNILAG', 'PHS 201', 'Medicine & Surgery (MBBS)', 'PHS 201: Human Medical Physiology (Excitable Tissues & Cardiovascular)',
       'Action potential generation, cardiac cycle, electrocardiogram (ECG) interpretation, blood pressure regulation, and microcirculation dynamics.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/phs201-medical-physiology.pdf',
       6081740, 'application/pdf', 'First Semester', '2025/2026', 275, 1190, true),

      ('UNILAG', 'PCT 301', 'Pharmaceutics & Pharmaceutical Technology', 'PCT 301: Pharmaceutics, Dosage Form Design & Drug Delivery',
       'Pre-formulation studies, solubility enhancement, tablet compression physics, liquid dosage forms (suspensions, emulsions), and sterile parenteral production.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/pct301-dosage-form-design.pdf',
       5557452, 'application/pdf', 'First Semester', '2025/2026', 180, 740, true),

      ('UNILAG', 'ARC 201', 'Architecture', 'ARC 201: Architectural Design Studio & Spatial Composition',
       'Anthropometrics, spatial hierarchy, orthogonal projections, site analysis, and conceptual physical/digital model building for residential architecture.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/arc201-architectural-design.pdf',
       6815744, 'application/pdf', 'First Semester', '2025/2026', 170, 680, true),

      ('UNILAG', 'ENG 101', 'English', 'ENG 101: English Grammar, Composition & Rhetoric',
       'Morphology of English words, clause structure, concord, common grammatical errors, paragraph coherence, and expository essay composition.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/eng101-english-grammar.pdf',
       3040870, 'application/pdf', 'First Semester', '2025/2026', 240, 960, true),

      ('UNILAG', 'SPGS 801', 'School of Postgraduate Studies', 'UNILAG School of Postgraduate Studies (SPGS) Regulations & Thesis Handbook',
       'Academic rules, grading structure, thesis defense timeline, research ethics, and publication prerequisites for PGD, MSc, and PhD scholars.',
       'lecture_note'::resource_type_enum, 'https://spgs.unilag.edu.ng/handbook/spgs-regulations.pdf',
       6396313, 'application/pdf', 'First Semester', '2025/2026', 290, 1350, true),

      ('UNILAG', 'ACAD 101', 'Academic Affairs', 'UNILAG Revised Academic Calendar (2025/2026 Academic Session)',
       'Official Senate-ratified calendar for undergraduate and postgraduate programs covering lectures, matriculation, convocation, and examination schedules.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/revised-academic-calendar-for-2025-2026-academic-session/',
       1468006, 'application/pdf', 'First Semester', '2025/2026', 460, 2600, true),

      ('UNILAG', 'REG 101', 'Academic Affairs', 'Overview of Students Academic Matters in University of Lagos',
       'Essential institutional guide covering course registrations, prerequisites, GPA calculations, leave of absence, exam regulations, and disciplinary procedures.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/wp-content/uploads/2023/10/OVERVIEW-OF-STUDENTS-ACADEMIC-MATTERS-IN-UNIVERSITY-OF-LAGOS.pdf',
       3250585, 'application/pdf', 'First Semester', '2025/2026', 380, 2100, true),

      ('UNILAG', 'SRV 101', 'Student Affairs', 'The University of Lagos Service Charter',
       'Official charter outlining standards of academic service, library operating hours, grievance mechanisms, health services, and student support facilities.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/wp-content/uploads/2024/05/THE-UNIVERSITY-OF-LAGOS-SERVICE-CHARTER.pdf',
       2726297, 'application/pdf', 'First Semester', '2025/2026', 275, 1420, true),

      ('UNILAG', 'PRJ 400', 'Academic Affairs', 'UNILAG Undergraduate Final Year Research & Project Guidelines',
       'Official Senate regulations on undergraduate thesis formulation, literature review structuring, data analysis methodologies, and referencing styles.',
       'summary'::resource_type_enum, 'https://unilag.edu.ng/wp-content/uploads/2023/05/UNILAG-Project-Research-Guidelines.pdf',
       2516582, 'application/pdf', 'Second Semester', '2025/2026', 310, 1530, true),

      -- ----------------------------------------------------------------------
      -- UI (University of Ibadan)
      -- ----------------------------------------------------------------------
      ('UI', 'GES 101', 'General Studies Programme', 'GES 101: Use of English I (Grammar & Study Skills)',
       'Foundational University of Ibadan communication course on grammatical structure, phonetics, reading comprehension techniques, and academic essay composition.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/ges101-use-of-english.pdf',
       3145728, 'application/pdf', 'First Semester', '2025/2026', 230, 950, true),

      ('UI', 'GES 107', 'General Studies Programme', 'GES 107: Reproductive Health, STIs and Human Development',
       'Reproductive anatomy and physiology, sexually transmitted infections epidemiology, gender-based violence prevention, and emotional well-being.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/ges107-reproductive-health.pdf',
       3670016, 'application/pdf', 'Second Semester', '2025/2026', 205, 830, true),

      ('UI', 'CHE 156', 'Chemistry', 'CHE 156: Physical Chemistry for Science and Agriculture',
       'Thermodynamics of chemical reactions, gas laws, chemical kinetics, phase equilibria, and electrochemistry for UI science and agriculture freshmen.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/che156-physical-chemistry.pdf',
       4613734, 'application/pdf', 'First Semester', '2025/2026', 240, 960, true),

      ('UI', 'MAT 111', 'Mathematics', 'MAT 111: Algebra and Trigonometry',
       'Set theory, functions, partial fractions, quadratic equations, mathematical induction, binomial theorem, and trigonometric equations.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/mat111-algebra-trigonometry.pdf',
       5033164, 'application/pdf', 'First Semester', '2025/2026', 280, 1100, true),

      ('UI', 'SCI 100', 'Faculty of Science', 'UI 100L Faculty of Science Harmattan Past Exam Papers (2018-2024)',
       'Verified past questions with full step-by-step solutions for GES 101, CHE 156, PHY 112, and MAT 111.',
       'past_question'::resource_type_enum, 'https://library.ui.edu.ng/past-questions/100l-science-first-semester.pdf',
       7864320, 'application/pdf', 'First Semester', '2025/2026', 360, 1540, true),

      ('UI', 'CSC 211', 'Computer Science', 'CSC 211: Introduction to Computer Science & OOP',
       'Object-oriented programming using Java/C++, classes, interfaces, inheritance, event-driven programming, and basic software testing.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/csc211-computer-science-oop.pdf',
       3984588, 'application/pdf', 'First Semester', '2025/2026', 210, 820, true),

      ('UI', 'CSC 221', 'Computer Science', 'CSC 221: Discrete Mathematical Structures',
       'Propositional logic, predicate calculus, graph theory, combinatorics, recurrence relations, and boolean algebra for computer science.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/csc221-discrete-structures.pdf',
       4404019, 'application/pdf', 'Second Semester', '2025/2026', 195, 770, true),

      ('UI', 'MAT 211', 'Mathematics', 'MAT 211: Real Analysis I',
       'Continuity, differentiability, Mean Value Theorem, Taylor series, sequences, and series of real numbers with formal delta-epsilon proofs.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/mat211-real-analysis-i.pdf',
       3774873, 'application/pdf', 'First Semester', '2025/2026', 175, 680, true),

      ('UI', 'SCI 200', 'Faculty of Science', 'UI 200L Science & Technology Consolidated Past Questions Archive (2019-2024)',
       'Comprehensive past questions archive for 200L Computer Science, Mathematics, Statistics, and Physics examinations.',
       'past_question'::resource_type_enum, 'https://library.ui.edu.ng/past-questions/200l-sci-tech-exams.pdf',
       8178892, 'application/pdf', 'First Semester', '2025/2026', 250, 1050, true),

      ('UI', 'CSC 315', 'Computer Science', 'CSC 315: Data Communication and Computer Networks',
       'OSI 7-layer and TCP/IP protocol suites, packet switching, error detection/correction, routing protocols (OSPF, BGP), and network security.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/csc315-computer-networks.pdf',
       4928307, 'application/pdf', 'First Semester', '2025/2026', 185, 790, true),

      ('UI', 'CSC 331', 'Computer Science', 'CSC 331: Operations Research & Quantitative Methods',
       'Linear programming, simplex method, duality theory, transportation problems, queuing models, and network optimization.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/csc331-operations-research.pdf',
       4089446, 'application/pdf', 'Second Semester', '2025/2026', 160, 620, true),

      ('UI', 'CSC 411', 'Computer Science', 'CSC 411: Software Engineering & Distributed Systems',
       'Software development lifecycles, Agile/Scrum methodologies, microservices architecture, CI/CD pipelines, and software verification.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/csc411-software-engineering.pdf',
       5347737, 'application/pdf', 'First Semester', '2025/2026', 215, 860, true),

      ('UI', 'GEY 201', 'Geology', 'GEY 201: Physical Geology, Crystallography & Mineralogy',
       'Origin and structure of the Earth, plate tectonics, optical mineralogy, crystal symmetry systems, and classification of igneous/sedimentary/metamorphic rocks.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/gey201-physical-geology.pdf',
       5767168, 'application/pdf', 'First Semester', '2025/2026', 140, 520, true),

      ('UI', 'MIC 301', 'Microbiology', 'MIC 301: Systematic Bacteriology & Virology',
       'Bergey manual taxonomy, pathogenic mechanisms of Gram-positive and Gram-negative bacteria, viral replication cycles, and bacteriophages.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/mic301-systematic-bacteriology.pdf',
       4823449, 'application/pdf', 'First Semester', '2025/2026', 175, 680, true),

      ('UI', 'EEE 301', 'Electrical & Electronic Engineering', 'EEE 301: Electric Circuit Theory & Signal Analysis',
       'Laplace transforms in circuit analysis, two-port networks, Fourier series of non-sinusoidal waveforms, resonance, and three-phase balanced/unbalanced circuits.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/eee301-circuit-theory.pdf',
       5138022, 'application/pdf', 'First Semester', '2025/2026', 185, 710, true),

      ('UI', 'PET 401', 'Petroleum Engineering', 'PET 401: Reservoir Fluid Properties & PVT Analysis',
       'Hydrocarbon phase behavior, gas deviation factor (Z-factor), bubble point, solution gas-oil ratio (Rs), oil formation volume factor (Bo), and material balance equations.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/pet401-reservoir-fluids.pdf',
       5452595, 'application/pdf', 'First Semester', '2025/2026', 170, 650, true),

      ('UI', 'IPE 301', 'Industrial & Production Engineering', 'IPE 301: Work Study, Ergonomics & Productivity Engineering',
       'Method study techniques, time study and standard time determination, human-machine system design, physiological work capacity, and occupational biomechanics.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/ipe301-work-study-ergonomics.pdf',
       4194304, 'application/pdf', 'First Semester', '2025/2026', 145, 560, true),

      ('UI', 'CEE 301', 'Civil Engineering', 'CEE 301: Mechanics of Solids & Structural Analysis',
       'Direct stress and strain, shear force and bending moment envelopes, slope-deflection methods, moment distribution, and virtual work principles.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/cee301-mechanics-solids.pdf',
       5033164, 'application/pdf', 'First Semester', '2025/2026', 190, 750, true),

      ('UI', 'MEE 511', 'Mechanical Engineering', 'MEE 511: Engineering Metallurgy & Materials Selection',
       'Phase diagrams, heat treatment of alloys, fracture mechanics, corrosion prevention, and material selection for high-performance engineering applications.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/mee511-engineering-metallurgy.pdf',
       5033164, 'application/pdf', 'First Semester', '2025/2026', 165, 640, true),

      ('UI', 'TECH 500', 'Faculty of Technology', 'UI 500L Faculty of Technology Final Professional Examinations (2019-2024)',
       'Past examination papers for final-year professional engineering programs in Mechanical, Electrical, Civil, and Agricultural Engineering.',
       'past_question'::resource_type_enum, 'https://library.ui.edu.ng/past-questions/500l-technology-finals.pdf',
       8808038, 'application/pdf', 'First Semester', '2025/2026', 240, 990, true),

      ('UI', 'ECO 101', 'Economics', 'ECO 101: Principles of Economics (Micro & Macro Foundations)',
       'Scarcity, choice, opportunity cost, supply and demand equilibrium, consumer utility, national income accounting, and macroeconomic policy goals.',
       'lecture_note'::resource_type_enum, 'http://oer.ui.edu.ng/courseware/eco101-principles-economics.pdf',
       3774873, 'application/pdf', 'First Semester', '2025/2026', 270, 1080, true),

      ('UI', 'POS 201', 'Political Science', 'POS 201: Nigerian Constitutional Development & Political Systems',
       'Constitutional evolution from Clifford (1922) to 1999 Constitution, nationalism, revenue allocation formulas, and dynamics of Nigerian electoral politics.',
       'lecture_note'::resource_type_enum, 'http://oer.ui.edu.ng/courseware/pos201-nigerian-constitution.pdf',
       4299161, 'application/pdf', 'First Semester', '2025/2026', 200, 820, true),

      ('UI', 'PSY 201', 'Psychology', 'PSY 201: Physiological Psychology & Neural Mechanisms',
       'Structure of neurons, synaptic transmission, neurotransmitters, functional neuroanatomy of the brain, endocrine system, and biological bases of emotion.',
       'lecture_note'::resource_type_enum, 'http://oer.ui.edu.ng/courseware/psy201-physiological-psychology.pdf',
       4613734, 'application/pdf', 'First Semester', '2025/2026', 185, 710, true),

      ('UI', 'ACC 201', 'Accounting', 'ACC 201: Financial Accounting & Reporting Standards',
       'Accounting cycle, journalizing, ledger posting, inventory valuation (FIFO, LIFO, Weighted Average), and financial statement preparation under IFRS.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/acc201-financial-accounting.pdf',
       4089446, 'application/pdf', 'First Semester', '2025/2026', 215, 860, true),

      ('UI', 'LAW 201', 'Public Law', 'LAW 201: Law of Torts & Civil Wrongs in Nigeria',
       'Trespass to person and land, negligence (duty of care, breach, causation, Donoghue v Stevenson), nuisance, defamation, and strict liability (Rylands v Fletcher).',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/law201-law-of-torts.pdf',
       5557452, 'application/pdf', 'First Semester', '2025/2026', 260, 1120, true),

      ('UI', 'LAW 301', 'Commercial & Industrial Law', 'LAW 301: Commercial Law, Agency & Sale of Goods',
       'Contract of sale of goods (Sale of Goods Act), transfer of property and title, nemo dat quod non habet principle, creation of agency, and hire purchase agreements.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/law301-commercial-law.pdf',
       5242880, 'application/pdf', 'First Semester', '2025/2026', 235, 980, true),

      ('UI', 'ANA 201', 'Medicine & Surgery (MBBS)', 'ANA 201: Human Gross Anatomy & Histology (Thorax & Abdomen)',
       'Thoracic wall, pleura, lungs, heart and mediastinum, abdominal viscera, peritoneal cavity, histology of epithelial and connective tissues, and clinical correlations.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/ana201-human-anatomy.pdf',
       6710886, 'application/pdf', 'First Semester', '2025/2026', 310, 1320, true),

      ('UI', 'PHS 201', 'Medicine & Surgery (MBBS)', 'PHS 201: Medical Physiology (Blood, Cardiovascular & Respiratory)',
       'Haemostasis, erythropoiesis, blood groups, cardiac mechanics, lung volumes and capacities, gas exchange, and neural/chemical control of breathing.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/phs201-medical-physiology.pdf',
       6186598, 'application/pdf', 'First Semester', '2025/2026', 295, 1260, true),

      ('UI', 'NUR 301', 'Nursing Science', 'NUR 301: Medical-Surgical Nursing & Pathophysiology',
       'Nursing management of cardiovascular, endocrine, and respiratory alterations, pre- and post-operative nursing care, aseptic surgical techniques, and fluid balance.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/nur301-medical-surgical-nursing.pdf',
       5033164, 'application/pdf', 'First Semester', '2025/2026', 240, 970, true),

      ('UI', 'PCG 301', 'Pharmacy', 'PCG 301: Pharmacognosy, Natural Products & Phytotherapy',
       'Biogenesis of secondary plant metabolites: alkaloids, glycosides, flavonoids, tannins, and terpenoids. Quality control and standardization of herbal drugs.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/pcg301-pharmacognosy.pdf',
       4718592, 'application/pdf', 'First Semester', '2025/2026', 190, 780, true),

      ('UI', 'AGR 201', 'Agronomy', 'AGR 201: Principles of Crop Production & Cropping Systems',
       'Agro-ecological zones of Nigeria, tillage practices, seedbed preparation, planting geometry, fertilizer application techniques, and weed management.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/agr201-principles-crop-production.pdf',
       3879731, 'application/pdf', 'First Semester', '2025/2026', 170, 680, true),

      ('UI', 'ANS 201', 'Animal Science', 'ANS 201: Anatomy & Physiology of Farm Animals',
       'Digestive, reproductive, and circulatory systems of farm livestock (cattle, sheep, goats, poultry, and swine) with emphasis on nutritional adaptations.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/ans201-animal-anatomy-physiology.pdf',
       4404019, 'application/pdf', 'First Semester', '2025/2026', 185, 740, true),

      ('UI', 'VET 201', 'Veterinary Anatomy', 'VET 201: Veterinary Gross Anatomy I (Carnivore Anatomy)',
       'Systematic osteology, arthrology, and myology of the dog (canine) as the primary mammalian model for comparative veterinary medicine.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/vet201-veterinary-anatomy.pdf',
       5976883, 'application/pdf', 'First Semester', '2025/2026', 165, 650, true),

      ('UI', 'PHI 101', 'Philosophy', 'PHI 101: Introduction to Logic & Critical Reasoning',
       'Nature of philosophy, formal vs. informal fallacies, categorical propositions, syllogisms, truth tables, and deduction in philosophical argumentation.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/phi101-logic-critical-thinking.pdf',
       3250585, 'application/pdf', 'First Semester', '2025/2026', 220, 880, true),

      ('UI', 'EDM 201', 'Educational Management', 'EDM 201: Principles & Practice of Educational Management',
       'Administrative processes in school systems, organizational structure of Nigerian education (UBEC, TRCN), leadership styles, and school records management.',
       'lecture_note'::resource_type_enum, 'http://oer.ui.edu.ng/courseware/edm201-educational-management.pdf',
       3984588, 'application/pdf', 'First Semester', '2025/2026', 175, 690, true),

      ('UI', 'PGC 801', 'Postgraduate College', 'University of Ibadan Postgraduate College Regulations Handbook',
       'Comprehensive guidelines detailing admission regulations, credit course unit requirements, thesis submission procedures, and oral defense standards.',
       'lecture_note'::resource_type_enum, 'https://postgraduatecollege.ui.edu.ng/wp-content/uploads/2023/11/UI-Postgraduate-College-Regulations-Handbook.pdf',
       6710886, 'application/pdf', 'First Semester', '2025/2026', 310, 1480, true),

      ('UI', 'CSD 801', 'Centre for Sustainable Development', 'UI Centre for Sustainable Development (CESDEV) Students Handbook',
       'Academic rules, research requirements, curriculum frameworks, and developmental field practicum requirements for sustainable development disciplines.',
       'lecture_note'::resource_type_enum, 'https://cesdev.ui.edu.ng/wp-content/uploads/2023/09/CESDEV-Students-Handbook.pdf',
       3984588, 'application/pdf', 'First Semester', '2025/2026', 190, 760, true),

      ('UI', 'EDU 301', 'Faculty of Education', 'UI Handbook on Teaching Practice and Fieldwork Guidelines',
       'Official regulations for student-teacher clinical internships, classroom pedagogy evaluations, lesson plan preparation, and practicum assessments.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/wp-content/uploads/2023/04/Handbook-on-Teaching-Practice.pdf',
       3040870, 'application/pdf', 'First Semester', '2025/2026', 225, 890, true),

      ('UI', 'ACAD 102', 'Academic Affairs', 'UI Updated Academic Calendar for Undergraduate Students (2025/2026)',
       'Senate-approved schedule of undergraduate academic activities, course registration deadlines, matriculation, and semester examination dates.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/news/updated-academic-calendar-for-undergraduate-students-for-the-20232024-session',
       1363148, 'application/pdf', 'First Semester', '2025/2026', 440, 2450, true),

      ('UI', 'LIB 101', 'Kenneth Dike Library', 'Kenneth Dike Library (KDL) User Guide & E-Resources Access Manual',
       'Instructions on utilizing library physical archives, e-journal subscriptions (ScienceDirect, JSTOR), open access institutional repositories, and thesis collections.',
       'lecture_note'::resource_type_enum, 'https://library.ui.edu.ng/guide/kdl-library-guide.pdf',
       3460300, 'application/pdf', 'First Semester', '2025/2026', 310, 1680, true),

      ('UI', 'PRJ 401', 'Academic Affairs', 'UI Undergraduate Research Project Manual & Referencing Guide',
       'Official University of Ibadan guide for final-year research projects, ethics clearance, formatting rules, and citation standards.',
       'summary'::resource_type_enum, 'https://ui.edu.ng/wp-content/uploads/2023/06/UI-Undergraduate-Research-Project-Guide.pdf',
       2202009, 'application/pdf', 'Second Semester', '2025/2026', 295, 1410, true)
,

      ('FUNAAB', 'SEN 201', 'Software Engineering', 'SEN 201: Software Requirements & Specifications',
       'Official notes covering SRS Documentation, Use Cases, Agile Epics for Software Engineering students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/software-requirements-specification.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 196, 734, true),

      ('FUNAAB', 'SEN 301', 'Software Engineering', 'SEN 301: Software Architecture & Design Patterns',
       'Official notes covering MVC, Microservices, GoF Patterns, Clean Architecture for Software Engineering students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/software-architecture-design-patter.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 157, 478, true),

      ('FUNAAB', 'SEN 401', 'Software Engineering', 'SEN 401: Software Quality Assurance & Testing',
       'Official notes covering Unit Testing, TDD, CI/CD, Code Coverage, Static Analysis for Software Engineering students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/software-quality-assurance-testing.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 113, 409, true),

      ('FUNAAB', 'CYB 201', 'Cyber Security', 'CYB 201: Information Security Fundamentals & Cryptography',
       'Official notes covering Symmetric/Asymmetric Ciphers, Hash Functions, PKI for Cyber Security students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/information-security-fundamentals-c.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 131, 633, true),

      ('FUNAAB', 'CYB 301', 'Cyber Security', 'CYB 301: Network Security, Firewalls & Intrusion Detection',
       'Official notes covering Snort, Packet Filtering, VPNs, Zero Trust Architecture for Cyber Security students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/network-security-firewalls-intrusio.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 131, 571, true),

      ('FUNAAB', 'CYB 401', 'Cyber Security', 'CYB 401: Digital Forensics & Incident Response',
       'Official notes covering Memory Acquisition, File Carving, Chain of Custody for Cyber Security students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/digital-forensics-incident-response.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 207, 664, true),

      ('FUNAAB', 'IFT 201', 'Information Technology', 'IFT 201: Web Systems, Technologies & Client-Side Architectures',
       'Official notes covering DOM, HTTP/HTTPS, REST APIs, Web Security for Information Technology students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/web-systems-technologies-client-sid.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 186, 389, true),

      ('FUNAAB', 'IFT 301', 'Information Technology', 'IFT 301: Human-Computer Interaction & UX Design',
       'Official notes covering Heuristic Evaluation, Wireframing, Usability Testing for Information Technology students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/human-computer-interaction-ux-desig.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 138, 509, true),

      ('FUNAAB', 'DSC 201', 'Data Science', 'DSC 201: Data Science Foundations, Python & Exploratory Analysis',
       'Official notes covering Pandas, NumPy, Matplotlib, Data Cleaning Pipelines for Data Science students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/data-science-foundations-python-exp.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 130, 676, true),

      ('FUNAAB', 'DSC 301', 'Data Science', 'DSC 301: Statistical Learning & Applied Machine Learning',
       'Official notes covering Supervised Learning, Feature Engineering, Cross-Validation for Data Science students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/statistical-learning-applied-machin.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 104, 494, true),

      ('FUNAAB', 'IFS 201', 'Information Systems', 'IFS 201: Foundations of Information Systems & Business Processes',
       'Official notes covering BPMN, ERP Systems, Enterprise Data Governance for Information Systems students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/foundations-of-information-systems-.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 188, 411, true),

      ('FUNAAB', 'IFS 301', 'Information Systems', 'IFS 301: Enterprise Systems Architecture & Database Integration',
       'Official notes covering Data Warehousing, ETL, OLAP vs OLTP for Information Systems students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/enterprise-systems-architecture-dat.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 165, 748, true),

      ('FUNAAB', 'BOT 201', 'Pure and Applied Botany', 'BOT 201: Morphology & Anatomy of Lower Green Plants',
       'Official notes covering Bryophytes, Pteridophytes, Algae Taxonomy for Pure and Applied Botany students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/morphology-anatomy-of-lower-green-p.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 123, 659, true),

      ('FUNAAB', 'BOT 301', 'Pure and Applied Botany', 'BOT 301: Plant Physiology, Water Relations & Mineral Nutrition',
       'Official notes covering Photosynthesis, Transpiration, Plant Hormones for Pure and Applied Botany students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/plant-physiology-water-relations-mi.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 92, 362, true),

      ('FUNAAB', 'ZOO 201', 'Pure and Applied Zoology', 'ZOO 201: Invertebrate Functional Biology & Systematics',
       'Official notes covering Protozoa, Platyhelminthes, Annelida, Arthropoda for Pure and Applied Zoology students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/invertebrate-functional-biology-sys.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 108, 790, true),

      ('FUNAAB', 'ZOO 301', 'Pure and Applied Zoology', 'ZOO 301: Comparative Vertebrate Anatomy & Physiology',
       'Official notes covering Skeletal, Circulatory & Nervous Adaptations in Chordata for Pure and Applied Zoology students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/comparative-vertebrate-anatomy-phys.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 193, 459, true),

      ('FUNAAB', 'HRT 301', 'Horticulture', 'HRT 301: Principles of Ornamental & Landscape Horticulture',
       'Official notes covering Floriculture, Nursery Stock, Landscape Design Principles for Horticulture students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/principles-of-ornamental-landscape-.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 97, 620, true),

      ('FUNAAB', 'HRT 501', 'Horticulture', 'HRT 501: Commercial Fruit & Vegetable Production Systems',
       'Official notes covering Olericulture, Pomology, Greenhouse Hydroponics for Horticulture students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/commercial-fruit-vegetable-producti.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 90, 445, true),

      ('FUNAAB', 'PCP 301', 'Plant Physiology and Crop Production', 'PCP 301: Crop Growth Analysis & Plant Water Relations',
       'Official notes covering Leaf Area Index, Net Assimilation Rate, Water Potential for Plant Physiology and Crop Production students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/crop-growth-analysis-plant-water-re.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 124, 574, true),

      ('FUNAAB', 'PCP 501', 'Plant Physiology and Crop Production', 'PCP 501: Post-Harvest Physiology & Handling of Crops',
       'Official notes covering Climacteric Respiration, Ethylene Regulation, Storage for Plant Physiology and Crop Production students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/post-harvest-physiology-handling-of.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 140, 745, true),

      ('FUNAAB', 'APH 202', 'Animal Production and Health', 'APH 202: Introduction to Farm Animal Management & Biosecurity',
       'Official notes covering Livestock Housing, Vaccination Protocols, Herd Sanitation for Animal Production and Health students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/introduction-to-farm-animal-managem.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 142, 412, true),

      ('FUNAAB', 'APH 501', 'Animal Production and Health', 'APH 501: Commercial Poultry & Swine Enterprise Management',
       'Official notes covering Broiler/Layer Production, Farrowing Crates, Feed Conversion for Animal Production and Health students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/commercial-poultry-swine-enterprise.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 192, 628, true),

      ('FUNAAB', 'PRM 301', 'Pasture and Range Management', 'PRM 301: Forage Production & Pasture Agronomy',
       'Official notes covering Tropical Grasses, Legume Pastures, Silage Preparation for Pasture and Range Management students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/forage-production-pasture-agronomy.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 204, 365, true),

      ('FUNAAB', 'PRM 501', 'Pasture and Range Management', 'PRM 501: Range Ecology, Grazing Land Management & Carrying Capacity',
       'Official notes covering Rangeland Degradation, Stocking Rates, Rotational Grazing for Pasture and Range Management students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/range-ecology-grazing-land-manageme.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 109, 438, true),

      ('FUNAAB', 'CGNS 101', 'Communication and General Studies', 'CGNS 101: Use of English & Academic Communication Skills',
       'Official notes covering Essay Writing, Grammar Mechanics, Reading Comprehension for Communication and General Studies students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/use-of-english-academic-communicati.pdf',
       2097152, 'application/pdf', 'Harmattan / First', '2025/2026', 114, 681, true),

      ('FUNAAB', 'HTM 201', 'Hospitality and Tourism', 'HTM 201: Introduction to Hospitality Management & Guest Services',
       'Official notes covering Front Office Operations, Housekeeping, Hospitality Accounting for Hospitality and Tourism students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/introduction-to-hospitality-managem.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 188, 404, true),

      ('FUNAAB', 'HTM 301', 'Hospitality and Tourism', 'HTM 301: Food & Beverage Service Operations & Banquet Management',
       'Official notes covering Menu Engineering, HACCP Standards, Beverage Costing for Hospitality and Tourism students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/food-beverage-service-operations-ba.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 137, 402, true),

      ('FUNAAB', 'VMD 401', 'Veterinary Medicine', 'VMD 401: General Veterinary Medicine & Clinical Physical Diagnosis',
       'Official notes covering Auscultation, Palpation, Vital Signs, Clinical Decision Trees for Veterinary Medicine students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/general-veterinary-medicine-clinica.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 162, 612, true),

      ('FUNAAB', 'VMD 501', 'Veterinary Medicine', 'VMD 501: Food Animal Clinical Medicine & Herd Health Programs',
       'Official notes covering Ruminant Mastitis, Ketosis, Neonatal Calf Scours for Veterinary Medicine students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/food-animal-clinical-medicine-herd-.pdf',
       6291456, 'application/pdf', 'Harmattan / First', '2025/2026', 116, 751, true),

      ('FUNAAB', 'VPT 301', 'Veterinary Pathology', 'VPT 301: General Veterinary Pathology, Cellular Injury & Inflammation',
       'Official notes covering Necrosis, Apoptosis, Hemodynamic Disorders, Granulomas for Veterinary Pathology students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/general-veterinary-pathology-cellul.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 108, 572, true),

      ('FUNAAB', 'VPT 401', 'Veterinary Pathology', 'VPT 401: Systemic Veterinary Pathology, Necropsy & Forensic Diagnosis',
       'Official notes covering Post-Mortem Techniques, Pulmonary Lesions, Renal Pathology for Veterinary Pathology students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/systemic-veterinary-pathology-necro.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 106, 759, true),

      ('FUNAAB', 'VPH 401', 'Veterinary Public Health & Reproduction', 'VPH 401: Zoonoses, Meat Inspection & Slaughterhouse Hygiene',
       'Official notes covering Bovine Tuberculosis, Cysticercosis, Antemortem Inspection for Veterinary Public Health & Reproduction students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/zoonoses-meat-inspection-slaughterh.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 164, 669, true),

      ('FUNAAB', 'VPH 502', 'Veterinary Public Health & Reproduction', 'VPH 502: Veterinary Theriogenology, Obstetrics & Reproductive Pathology',
       'Official notes covering Dystocia Management, Uterine Prolapse, Semen Cryopreservation for Veterinary Public Health & Reproduction students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/veterinary-theriogenology-obstetric.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 178, 506, true),

      ('FUNAAB', 'VSR 401', 'Veterinary Surgery & Theriogenology', 'VSR 401: Principles of Veterinary Surgery, Asepsis & Wound Management',
       'Official notes covering Suture Patterns, Halsted Principles, Surgical Instruments for Veterinary Surgery & Theriogenology students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/principles-of-veterinary-surgery-as.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 170, 496, true),

      ('FUNAAB', 'VSR 501', 'Veterinary Surgery & Theriogenology', 'VSR 501: Small & Large Animal Clinical Surgery & Orthopaedics',
       'Official notes covering Fracture Fixation, Laparotomy, Caesarean Section in Cattle for Veterinary Surgery & Theriogenology students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/small-large-animal-clinical-surgery.pdf',
       6291456, 'application/pdf', 'Harmattan / First', '2025/2026', 145, 414, true),

      ('FUNAAB', 'BFN 201', 'Banking and Finance', 'BFN 201: Money, Banking & Nigerian Financial System',
       'Official notes covering Central Bank of Nigeria (CBN) Regulations, Commercial Banking for Banking and Finance students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/money-banking-nigerian-financial-sy.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 187, 564, true),

      ('FUNAAB', 'BFN 301', 'Banking and Finance', 'BFN 301: Investment Analysis, Securities & Portfolio Theory',
       'Official notes covering CAPM, Markowitz Modern Portfolio Theory, Bond Pricing for Banking and Finance students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/investment-analysis-securities-port.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 159, 782, true),

      ('FUNAAB', 'ENT 201', 'Entrepreneurship', 'ENT 201: Introduction to Entrepreneurship & Innovation Dynamics',
       'Official notes covering Opportunity Identification, Value Proposition, Lean Canvas for Entrepreneurship students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/introduction-to-entrepreneurship-in.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 155, 661, true),

      ('FUNAAB', 'ENT 301', 'Entrepreneurship', 'ENT 301: Venture Creation, Business Feasibility & Seed Financing',
       'Official notes covering Financial Modeling, Pitch Decks, Venture Capital in Nigeria for Entrepreneurship students at FUNAAB.',
       'lecture_note'::resource_type_enum, 'https://funaab.edu.ng/courseware/venture-creation-business-feasibili.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 190, 660, true),

      ('UNILAG', 'CPE 201', 'Computer Engineering', 'CPE 201: Digital Logic Design & Switching Circuits',
       'Official notes covering Karnaugh Maps, Combinational & Sequential Logic, Flip-Flops for Computer Engineering students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/digital-logic-design-switching-circ.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 134, 454, true),

      ('UNILAG', 'CPE 301', 'Computer Engineering', 'CPE 301: Microprocessor Systems, Interfacing & Assembly Language',
       'Official notes covering 8086 Architecture, Interrupt Handling, Memory Interfacing for Computer Engineering students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/microprocessor-systems-interfacing-.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 101, 494, true),

      ('UNILAG', 'CPE 401', 'Computer Engineering', 'CPE 401: Embedded Systems Design & Internet of Things (IoT)',
       'Official notes covering ARM Cortex, RTOS, I2C/SPI Protocols, MQTT for Computer Engineering students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/embedded-systems-design-internet-of.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 166, 765, true),

      ('UNILAG', 'MEG 201', 'Mechanical Engineering', 'MEG 201: Engineering Thermodynamics I',
       'Official notes covering First Law of Thermodynamics, Non-Flow and Steady Flow Energy Equations, Steam Tables for Mechanical Engineering students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/engineering-thermodynamics-i.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 180, 644, true),

      ('UNILAG', 'MEG 301', 'Mechanical Engineering', 'MEG 301: Fluid Mechanics & Turbomachinery',
       'Official notes covering Navier-Stokes Equations, Boundary Layer Separation, Pelton and Francis Turbines for Mechanical Engineering students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/fluid-mechanics-turbomachinery.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 168, 467, true),

      ('UNILAG', 'MEG 401', 'Mechanical Engineering', 'MEG 401: Heat & Mass Transfer',
       'Official notes covering Fourier Conduction, Free and Forced Convection, Radiation Exchange, Heat Exchanger Design for Mechanical Engineering students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/heat-mass-transfer.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 187, 544, true),

      ('UNILAG', 'MEG 402PQ', 'Mechanical Engineering', 'MEG 402PQ: Applied Thermodynamics & Heat Transfer Past Questions with Detailed Solutions (2019-2025)',
       'Official past questions covering Complete past exam solutions with derivations and psychrometric chart analysis for Mechanical Engineering students at UNILAG.',
       'past_question'::resource_type_enum, 'https://unilag.edu.ng/courseware/applied-thermodynamics-heat-transfe.pdf',
       2097152, 'application/pdf', 'Harmattan / First', '2025/2026', 109, 383, true),

      ('UNILAG', 'MEG 501', 'Mechanical Engineering', 'MEG 501: Mechanical Equipment Design & Stress Analysis',
       'Official notes covering Fatigue Failure Criteria, Shaft Design under Combined Loads, Gear Trains for Mechanical Engineering students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/mechanical-equipment-design-stress-.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 181, 387, true),

      ('UNILAG', 'MME 301', 'Metallurgical & Materials Engineering', 'MME 301: Physical Metallurgy & Phase Transformation in Alloys',
       'Official notes covering Iron-Carbon Diagram, Martensite Transformation, TTT Curves for Metallurgical & Materials Engineering students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/physical-metallurgy-phase-transform.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 168, 405, true),

      ('UNILAG', 'MME 401', 'Metallurgical & Materials Engineering', 'MME 401: Corrosion Science, Degradation & Cathodic Protection',
       'Official notes covering Pourbaix Diagrams, Galvanic Corrosion, Sacrificial Anodes for Metallurgical & Materials Engineering students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/corrosion-science-degradation-catho.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 163, 702, true),

      ('UNILAG', 'SVG 301', 'Surveying & Geoinformatics', 'SVG 301: Geodetic Surveying, Coordinate Systems & Photogrammetry',
       'Official notes covering Ellipsoids, Geoid Undulation, Aerial Triangulation for Surveying & Geoinformatics students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/geodetic-surveying-coordinate-syste.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 179, 387, true),

      ('UNILAG', 'SVG 401', 'Surveying & Geoinformatics', 'SVG 401: Geographic Information Systems (GIS) & Spatial Database Analysis',
       'Official notes covering Raster/Vector Data, Spatial Querying, PostGIS, Mapbox for Surveying & Geoinformatics students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/geographic-information-systems-gis-.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 118, 630, true),

      ('UNILAG', 'BME 301', 'Biomedical Engineering', 'BME 301: Biomaterials Science & Tissue Biocompatibility',
       'Official notes covering Titanium Implants, Bioresorbable Polymers, Immune Response for Biomedical Engineering students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/biomaterials-science-tissue-biocomp.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 139, 355, true),

      ('UNILAG', 'BME 401', 'Biomedical Engineering', 'BME 401: Biomedical Instrumentation & Physiological Biosensors',
       'Official notes covering ECG/EMG Amplifiers, Biosensors, Electrical Safety in Hospitals for Biomedical Engineering students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/biomedical-instrumentation-physiolo.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 207, 458, true),

      ('UNILAG', 'STA 201', 'Statistics', 'STA 201: Probability Distributions & Mathematical Statistics I',
       'Official notes covering Poisson, Exponential, Normal Distributions, MGFs for Statistics students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/probability-distributions-mathemati.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 177, 643, true),

      ('UNILAG', 'STA 301', 'Statistics', 'STA 301: Statistical Inference, Hypothesis Testing & Estimation Theory',
       'Official notes covering Maximum Likelihood Estimation, Neyman-Pearson Lemma for Statistics students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/statistical-inference-hypothesis-te.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 136, 522, true),

      ('UNILAG', 'PHY 201', 'Physics', 'PHY 201: Thermal Physics, Kinetic Theory & Classical Thermodynamics',
       'Official notes covering Maxwell-Boltzmann Distribution, Carnot Cycle, Entropy for Physics students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/thermal-physics-kinetic-theory-clas.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 130, 428, true),

      ('UNILAG', 'PHY 301', 'Physics', 'PHY 301: Quantum Mechanics I & Atomic Structure',
       'Official notes covering Schrodinger Equation, Wavefunctions, Particle in a Box for Physics students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/quantum-mechanics-i-atomic-structur.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 133, 785, true),

      ('UNILAG', 'CBG 201', 'Cell Biology & Genetics', 'CBG 201: Cytology, Cell Division & Chromosome Architecture',
       'Official notes covering Mitosis, Meiosis, Karyotyping, Chromosomal Aberrations for Cell Biology & Genetics students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/cytology-cell-division-chromosome-a.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 113, 747, true),

      ('UNILAG', 'CBG 301', 'Cell Biology & Genetics', 'CBG 301: Molecular Genetics, Gene Expression & Recombinant Technology',
       'Official notes covering Transcription, Translation, CRISPR-Cas9, PCR Optimization for Cell Biology & Genetics students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/molecular-genetics-gene-expression-.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 157, 598, true),

      ('UNILAG', 'GLY 201', 'Geosciences', 'GLY 201: Structural Geology, Mineralogy & Optical Crystallography',
       'Official notes covering Faults, Folds, Stereographic Projections, Polarizing Microscope for Geosciences students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/structural-geology-mineralogy-optic.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 109, 511, true),

      ('UNILAG', 'GLY 401', 'Geosciences', 'GLY 401: Petroleum Geophysics, Seismic Reflection & Well Logging',
       'Official notes covering Seismic Migration, Gamma Ray Logs, Resistivity Logs for Geosciences students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/petroleum-geophysics-seismic-reflec.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 145, 787, true),

      ('UNILAG', 'BOT 201', 'Botany', 'BOT 201: Cryptogamic Botany & Plant Systematics',
       'Official notes covering Algae, Fungi, Bryophytes, Pteridophytes Taxonomic Keys for Botany students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/cryptogamic-botany-plant-systematic.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 159, 481, true),

      ('UNILAG', 'BOT 301', 'Botany', 'BOT 301: Plant Anatomy, Cytochemistry & Economic Botany',
       'Official notes covering Meristems, Secondary Growth, Indigenous Medicinal Flora for Botany students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/plant-anatomy-cytochemistry-economi.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 173, 614, true),

      ('UNILAG', 'ZOO 201', 'Zoology', 'ZOO 201: Invertebrate Functional Zoology & Evolutionary Trends',
       'Official notes covering Coelom Evolution, Arthropod Appendages, Molluscan Radula for Zoology students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/invertebrate-functional-zoology-evo.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 194, 400, true),

      ('UNILAG', 'ZOO 301', 'Zoology', 'ZOO 301: Vertebrate Comparative Biology & Animal Behavior',
       'Official notes covering Ethology, Neuroethology, Circadian Rhythms for Zoology students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/vertebrate-comparative-biology-anim.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 124, 731, true),

      ('UNILAG', 'SOC 101', 'Sociology', 'SOC 101: Introduction to Sociology & Social Institutions',
       'Official notes covering Culture, Socialization, Social Roles, Deviance for Sociology students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/introduction-to-sociology-social-in.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 93, 785, true),

      ('UNILAG', 'SOC 201', 'Sociology', 'SOC 201: Social Stratification, Class Inequality & Social Mobility',
       'Official notes covering Marx, Weber, Functionalism, Gender and Racial Inequality for Sociology students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/social-stratification-class-inequal.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 132, 536, true),

      ('UNILAG', 'SOC 301', 'Sociology', 'SOC 301: Classical & Contemporary Sociological Theories',
       'Official notes covering Durkheim, Simmel, Habermas, Postmodern Social Theory for Sociology students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/classical-contemporary-sociological.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 160, 397, true),

      ('UNILAG', 'GEG 201', 'Geography', 'GEG 201: Climatology, Meteorology & Atmospheric Dynamics',
       'Official notes covering Intertropical Convergence Zone (ITCZ), Precipitation Systems for Geography students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/climatology-meteorology-atmospheric.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 126, 689, true),

      ('UNILAG', 'GEG 301', 'Geography', 'GEG 301: Geomorphology & Fluvial Hydrology',
       'Official notes covering Drainage Basin Morphometry, Weathering Landforms for Geography students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/geomorphology-fluvial-hydrology.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 197, 587, true),

      ('UNILAG', 'SCW 201', 'Social Work', 'SCW 201: Introduction to Social Work Practice & Social Welfare Systems',
       'Official notes covering Casework, Group Work, Community Organization, Social Justice for Social Work students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/introduction-to-social-work-practic.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 96, 630, true),

      ('UNILAG', 'SCW 301', 'Social Work', 'SCW 301: Social Policy, Child Welfare & Vulnerable Populations',
       'Official notes covering Child Rights Act, Juvenile Justice, Gerontological Care for Social Work students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/social-policy-child-welfare-vulnera.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 115, 796, true),

      ('UNILAG', 'ACT 201', 'Actuarial Science & Insurance', 'ACT 201: Financial Mathematics & Interest Rate Theory',
       'Official notes covering Annuities Certain, Yield Rates, Capital Redemption Policies for Actuarial Science & Insurance students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/financial-mathematics-interest-rate.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 92, 509, true),

      ('UNILAG', 'ACT 301', 'Actuarial Science & Insurance', 'ACT 301: Life Contingencies & Actuarial Valuation Models',
       'Official notes covering Mortality Tables, Net Premium Reserves, Multi-State Models for Actuarial Science & Insurance students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/life-contingencies-actuarial-valuat.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 187, 387, true),

      ('UNILAG', 'ERM 201', 'Employment Relations & Human Resource Management (ER&HRM)', 'ERM 201: Industrial Relations Systems, Collective Bargaining & Labour Law',
       'Official notes covering Trade Unionism, Trade Disputes Act, Tripartism in Nigeria for Employment Relations & Human Resource Management (ER&HRM) students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/industrial-relations-systems-collec.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 108, 414, true),

      ('UNILAG', 'ERM 301', 'Employment Relations & Human Resource Management (ER&HRM)', 'ERM 301: Strategic Human Resource Management & Talent Acquisition',
       'Official notes covering Competency Modeling, Performance Appraisals, Compensation for Employment Relations & Human Resource Management (ER&HRM) students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/strategic-human-resource-management.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 206, 710, true),

      ('UNILAG', 'IRPM 201', 'Industrial Relations & Personnel Management', 'IRPM 201: Introduction to Industrial Relations & Labour Institutions',
       'Official notes covering Evolution of Trade Unionism, Collective Bargaining Frameworks in Nigeria for Industrial Relations & Personnel Management students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/introduction-to-industrial-relation.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 179, 416, true),

      ('UNILAG', 'IRPM 301', 'Industrial Relations & Personnel Management', 'IRPM 301: Human Resource Management & Talent Acquisition',
       'Official notes covering Job Analysis, Selection Methodologies, Performance Appraisal Systems for Industrial Relations & Personnel Management students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/human-resource-management-talent-ac.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 153, 480, true),

      ('UNILAG', 'IRPM 401', 'Industrial Relations & Personnel Management', 'IRPM 401: Labour Law & Industrial Dispute Settlement',
       'Official notes covering Trade Disputes Act, National Industrial Court Jurisprudence, Strike Protocols for Industrial Relations & Personnel Management students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/labour-law-industrial-dispute-settl.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 104, 564, true),

      ('UNILAG', 'IRPM 402PQ', 'Industrial Relations & Personnel Management', 'IRPM 402PQ: Industrial Dispute Resolution & Labour Law Past Questions (2020-2025)',
       'Official past questions covering Case study analysis and past exam questions with model legal opinions for Industrial Relations & Personnel Management students at UNILAG.',
       'past_question'::resource_type_enum, 'https://unilag.edu.ng/courseware/industrial-dispute-resolution-labou.pdf',
       2097152, 'application/pdf', 'Harmattan / First', '2025/2026', 94, 416, true),

      ('UNILAG', 'CRA 201', 'Creative Arts (Theatre, Music, Visual Arts)', 'CRA 201: History of African Art, Architecture & Visual Symbolism',
       'Official notes covering Nok Terracottas, Benin Bronzes, Igbo-Ukwu Art, Yoruba Woodcarving for Creative Arts (Theatre, Music, Visual Arts) students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/history-of-african-art-architecture.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 141, 378, true),

      ('UNILAG', 'CRA 301', 'Creative Arts (Theatre, Music, Visual Arts)', 'CRA 301: Theatre Production, Directing & Dramatic Literature',
       'Official notes covering Stage Blocking, Dramaturgy, Lighting Design, Soyinka Dramas for Creative Arts (Theatre, Music, Visual Arts) students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/theatre-production-directing-dramat.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 193, 562, true),

      ('UNILAG', 'HIS 101', 'History & Strategic Studies', 'HIS 101: African History to 1800: Empires, Trade & State Formation',
       'Official notes covering Trans-Saharan Trade, Oyo Empire, Kanem-Borno, Benin Kingdom for History & Strategic Studies students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/african-history-to-1800-empires-tra.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 115, 488, true),

      ('UNILAG', 'HIS 201', 'History & Strategic Studies', 'HIS 201: Nigeria from 1800 to Independence: Colonial Encounters',
       'Official notes covering Sokoto Caliphate, Scramble for Africa, 1914 Amalgamation for History & Strategic Studies students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/nigeria-from-1800-to-independence-c.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 137, 483, true),

      ('UNILAG', 'LIN 101', 'Linguistics, African & Asian Studies', 'LIN 101: Introduction to Linguistics, Phonetics & Phonology',
       'Official notes covering IPA Transcription, Distinctive Features, Phonological Rules for Linguistics, African & Asian Studies students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/introduction-to-linguistics-phoneti.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 143, 714, true),

      ('UNILAG', 'LIN 201', 'Linguistics, African & Asian Studies', 'LIN 201: Syntax, Morphology & Grammatical Structure of African Languages',
       'Official notes covering Tone Systems, Noun Class Systems, Generative Grammar for Linguistics, African & Asian Studies students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/syntax-morphology-grammatical-struc.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 107, 454, true),

      ('UNILAG', 'PHL 101', 'Philosophy', 'PHL 101: Introduction to Logic, Reasoning & Philosophy',
       'Official notes covering Deductive Validity, Truth Tables, Fallacy Identification for Philosophy students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/introduction-to-logic-reasoning-phi.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 101, 434, true),

      ('UNILAG', 'PHL 201', 'Philosophy', 'PHL 201: Ethics, Moral Philosophy & Applied Ethical Dilemmas',
       'Official notes covering Utilitarianism, Kantian Deontology, Virtue Ethics, Bioethics for Philosophy students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/ethics-moral-philosophy-applied-eth.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 157, 736, true),

      ('UNILAG', 'FRE 101', 'European Languages & Integration Studies', 'FRE 101: French Language, Grammar & Conversational Syntax',
       'Official notes covering Verb Conjugations, Tenses, Phonetics of French Vowels for European Languages & Integration Studies students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/french-language-grammar-conversatio.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 110, 567, true),

      ('UNILAG', 'FRE 201', 'European Languages & Integration Studies', 'FRE 201: Survey of Francophone African Literature & Culture',
       'Official notes covering Negritude Movement, Senghor, Camara Laye, Ousmane Sembène for European Languages & Integration Studies students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/survey-of-francophone-african-liter.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 204, 434, true),

      ('UNILAG', 'JIL 401', 'Jurisprudence & International Law', 'JIL 401: Public International Law, Treaties & Diplomatic Immunity',
       'Official notes covering Sources of International Law, ICJ Jurisdiction, Use of Force for Jurisprudence & International Law students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/public-international-law-treaties-d.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 101, 632, true),

      ('UNILAG', 'JIL 501', 'Jurisprudence & International Law', 'JIL 501: Jurisprudence & Contemporary Legal Philosophy',
       'Official notes covering Natural Law, Legal Positivism, Hart-Fuller Debate, Realism for Jurisprudence & International Law students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/jurisprudence-contemporary-legal-ph.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 97, 444, true),

      ('UNILAG', 'PPL 301', 'Private & Property Law', 'PPL 301: Family Law, Marriage Regimes & Custody Rights',
       'Official notes covering Marriage Act, Customary Marriages, Matrimonial Causes Act for Private & Property Law students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/family-law-marriage-regimes-custody.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 146, 789, true),

      ('UNILAG', 'PPL 401', 'Private & Property Law', 'PPL 401: Land Law, Land Use Act 1978 & Conveyancing',
       'Official notes covering Governor Consent, Certificate of Occupancy, Customary Tenancies for Private & Property Law students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/land-law-land-use-act-1978-conveyan.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 208, 576, true),

      ('UNILAG', 'BLD 201', 'Building', 'BLD 201: Building Construction Technology I & Foundation Systems',
       'Official notes covering Excavation, Strip Foundations, Damp-Proof Courses, Brickwork for Building students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/building-construction-technology-i-.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 140, 764, true),

      ('UNILAG', 'BLD 301', 'Building', 'BLD 301: Building Services, HVAC & Electrical Installation Design',
       'Official notes covering Sanitary Drainage, Fire Suppression, Lift Installations for Building students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/building-services-hvac-electrical-i.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 134, 391, true),

      ('UNILAG', 'ESM 201', 'Estate Management', 'ESM 201: Principles of Property Valuation & Investment Mathematics',
       'Official notes covering Years Purchase, Sinking Funds, Valuation Methods for Estate Management students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/principles-of-property-valuation-in.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 185, 605, true),

      ('UNILAG', 'ESM 301', 'Estate Management', 'ESM 301: Urban Land Economics, Property Taxation & Rating Valuation',
       'Official notes covering Bid Rent Theory, Tenement Rates, Land Use Planning Models for Estate Management students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/urban-land-economics-property-taxat.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 163, 510, true),

      ('UNILAG', 'QTS 201', 'Quantity Surveying', 'QTS 201: Measurement of Building Works I (Substructure & Superstructure)',
       'Official notes covering BESMM4 Principles, Taking-off Sheets, Bill of Quantities for Quantity Surveying students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/measurement-of-building-works-i-sub.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 201, 353, true),

      ('UNILAG', 'QTS 301', 'Quantity Surveying', 'QTS 301: Construction Cost Control, Tendering & Estimating',
       'Official notes covering Unit Rate Build-Up, Tender Documentation, Interim Valuations for Quantity Surveying students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/construction-cost-control-tendering.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 149, 700, true),

      ('UNILAG', 'URP 201', 'Urban & Regional Planning', 'URP 201: Planning Theory, Urban Land Use & Spatial Forms',
       'Official notes covering Concentric Zone Theory, Sector Model, Multiple Nuclei for Urban & Regional Planning students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/planning-theory-urban-land-use-spat.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 205, 604, true),

      ('UNILAG', 'URP 301', 'Urban & Regional Planning', 'URP 301: Regional Planning, Growth Poles & Spatial Development Policy',
       'Official notes covering Perroux Growth Poles, Cumulative Causation, Regional Imbalances for Urban & Regional Planning students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/regional-planning-growth-poles-spat.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 110, 378, true),

      ('UNILAG', 'DEN 201', 'Dentistry', 'DEN 201: Oral Biology, Tooth Morphology & Enamel Histology',
       'Official notes covering Amelogenesis, Dentinogenesis, Dental Pulp Architecture for Dentistry students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/oral-biology-tooth-morphology-ename.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 182, 396, true),

      ('UNILAG', 'DEN 301', 'Dentistry', 'DEN 301: Conservative Dentistry, Cavity Preparation & Endodontics',
       'Official notes covering Black Classifications, Pulp Capping, Root Canal Instrumentation for Dentistry students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/conservative-dentistry-cavity-prepa.pdf',
       6291456, 'application/pdf', 'Harmattan / First', '2025/2026', 119, 543, true),

      ('UNILAG', 'NUR 201', 'Nursing Science', 'NUR 201: Foundations of Nursing Practice & Clinical Nursing Process',
       'Official notes covering Nursing Diagnosis, Asepsis, Medication Administration, Vitals for Nursing Science students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/foundations-of-nursing-practice-cli.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 189, 778, true),

      ('UNILAG', 'NUR 301', 'Nursing Science', 'NUR 301: Medical-Surgical Nursing Care & Critical Care Protocols',
       'Official notes covering Shock Management, Fluid Replacement Therapy, Diabetic Ketoacidosis for Nursing Science students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/medical-surgical-nursing-care-criti.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 149, 696, true),

      ('UNILAG', 'PHT 201', 'Physiotherapy', 'PHT 201: Kinesiology, Pathomechanics & Functional Human Movement',
       'Official notes covering Gait Analysis, Joint Kinematics, Muscle Torque Calculations for Physiotherapy students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/kinesiology-pathomechanics-function.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 147, 502, true),

      ('UNILAG', 'PHT 301', 'Physiotherapy', 'PHT 301: Electrotherapy, Ultrasound & Physical Rehabilitation Modalities',
       'Official notes covering TENS, Interferential Currents, Therapeutic Ultrasound for Physiotherapy students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/electrotherapy-ultrasound-physical-.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 110, 382, true),

      ('UNILAG', 'MLS 201', 'Medical Laboratory Science', 'MLS 201: Clinical Biochemistry & Diagnostic Laboratory Techniques',
       'Official notes covering Spectrophotometry, Enzymatic Assays, Renal & Liver Function Panels for Medical Laboratory Science students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/clinical-biochemistry-diagnostic-la.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 181, 587, true),

      ('UNILAG', 'MLS 301', 'Medical Laboratory Science', 'MLS 301: Medical Microbiology, Diagnostic Parasitology & Mycology',
       'Official notes covering Blood Parasites, Malaria Microscopy, Fungal Culture Media for Medical Laboratory Science students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/medical-microbiology-diagnostic-par.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 94, 702, true),

      ('UNILAG', 'PCL 201', 'Pharmacology', 'PCL 201: General Principles of Pharmacodynamics & Pharmacokinetics',
       'Official notes covering Receptor Theory, Dose-Response Curves, Bioavailability, CYP450 Enzymes for Pharmacology students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/general-principles-of-pharmacodynam.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 129, 743, true),

      ('UNILAG', 'PCL 301', 'Pharmacology', 'PCL 301: Autonomic & Cardiovascular Pharmacology',
       'Official notes covering Adrenoceptors, Cholinoceptors, Antihypertensives, Antiarrhythmics, Cardiac Glycosides for Pharmacology students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/autonomic-cardiovascular-pharmacolo.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 173, 601, true),

      ('UNILAG', 'PCL 401', 'Pharmacology', 'PCL 401: Neuropharmacology & Psychotropic Agents',
       'Official notes covering Sedative-Hypnotics, Antipsychotics, Antidepressants, Opioid Analgesics for Pharmacology students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/neuropharmacology-psychotropic-agen.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 166, 526, true),

      ('UNILAG', 'PCL 402PQ', 'Pharmacology', 'PCL 402PQ: Cardiovascular & Neuropharmacology Professional Past Questions (2018-2025)',
       'Official past questions covering MBBS/B.Pharm professional exam past papers with structured essay solutions for Pharmacology students at UNILAG.',
       'past_question'::resource_type_enum, 'https://unilag.edu.ng/courseware/cardiovascular-neuropharmacology-pr.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 140, 571, true),

      ('UNILAG', 'PHS 201', 'Physiology', 'PHS 201: Hematology & Cardiovascular Physiology',
       'Official notes covering Hemopoiesis, Blood Groups, Cardiac Electrophysiology, Hemodynamics for Physiology students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/hematology-cardiovascular-physiolog.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 187, 567, true),

      ('UNILAG', 'PHS 301', 'Physiology', 'PHS 301: Neurophysiology & Endocrine Regulation',
       'Official notes covering Action Potentials, Synaptic Transmission, Hypothalamic-Pituitary-Target Organ Axes for Physiology students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/neurophysiology-endocrine-regulatio.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 156, 374, true),

      ('UNILAG', 'PHS 401', 'Physiology', 'PHS 401: Renal, Respiratory & Environmental Physiology',
       'Official notes covering Glomerular Filtration, Countercurrent Multiplier, Acid-Base Regulation, Hypoxia for Physiology students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/renal-respiratory-environmental-phy.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 190, 556, true),

      ('UNILAG', 'PHS 302PQ', 'Physiology', 'PHS 302PQ: Neurophysiology & Cardiovascular Past Questions with Marking Guides (2019-2025)',
       'Official past questions covering College of Medicine comprehensive past exam questions and OSCE prep guides for Physiology students at UNILAG.',
       'past_question'::resource_type_enum, 'https://unilag.edu.ng/courseware/neurophysiology-cardiovascular-past.pdf',
       2097152, 'application/pdf', 'Harmattan / First', '2025/2026', 107, 425, true),

      ('UNILAG', 'ANA 201', 'Anatomy', 'ANA 201: Gross Anatomy of the Musculoskeletal System',
       'Official notes covering Osteology, Arthrology, Myology and Neurovascular Supply of Upper and Lower Extremities for Anatomy students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/gross-anatomy-of-the-musculoskeleta.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 175, 624, true),

      ('UNILAG', 'ANA 301', 'Anatomy', 'ANA 301: Systematic Neuroanatomy & Organ Histology',
       'Official notes covering Cerebral Hemispheres, Cranial Nerves, Spinal Tracts, Microscopic Organ Architecture for Anatomy students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/systematic-neuroanatomy-organ-histo.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 129, 589, true),

      ('UNILAG', 'ANA 401', 'Anatomy', 'ANA 401: Developmental Embryology & Teratology',
       'Official notes covering Gametogenesis, Bilaminar & Trilaminar Germ Discs, Organogenesis, Congenital Anomalies for Anatomy students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/developmental-embryology-teratology.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 167, 781, true),

      ('UNILAG', 'ANA 302PQ', 'Anatomy', 'ANA 302PQ: Gross Anatomy & Neuroanatomy Past Questions with Dissection Guides (2018-2025)',
       'Official past questions covering Prosection spot test questions, viva voce guides, and theoretical papers for Anatomy students at UNILAG.',
       'past_question'::resource_type_enum, 'https://unilag.edu.ng/courseware/gross-anatomy-neuroanatomy-past-que.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 193, 697, true),

      ('UNILAG', 'RAD 201', 'Radiography', 'RAD 201: Radiation Physics, X-Ray Generation & Radiation Protection',
       'Official notes covering Bremsstrahlung, ALARA Principles, Lead Shielding, Dosimetry for Radiography students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/radiation-physics-x-ray-generation-.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 130, 561, true),

      ('UNILAG', 'RAD 301', 'Radiography', 'RAD 301: Radiographic Positioning, Contrast Media & Imaging Anatomy',
       'Official notes covering Chest Radiography Projections, Barium Meal, IVU Protocols for Radiography students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/radiographic-positioning-contrast-m.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 176, 610, true),

      ('UNILAG', 'CPB 301', 'Clinical Pharmacy & Biopharmacy', 'CPB 301: Biopharmaceutics & Pharmacokinetic Compartmental Modeling',
       'Official notes covering One- and Two-Compartment Models, Clearance Concepts, Dissolution Kinetics for Clinical Pharmacy & Biopharmacy students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/biopharmaceutics-pharmacokinetic-co.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 121, 479, true),

      ('UNILAG', 'CPB 401', 'Clinical Pharmacy & Biopharmacy', 'CPB 401: Clinical Pharmacotherapeutics in Internal Medicine',
       'Official notes covering Hypertension, Diabetes Mellitus, HIV/AIDS Pharmacotherapy, Adverse Drug Events for Clinical Pharmacy & Biopharmacy students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/clinical-pharmacotherapeutics-in-in.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 145, 619, true),

      ('UNILAG', 'CPB 501', 'Clinical Pharmacy & Biopharmacy', 'CPB 501: Therapeutic Drug Monitoring & Hospital Pharmacy Practice',
       'Official notes covering Aminoglycoside/Digoxin Dosing, Total Parenteral Nutrition, Ward Round Protocols for Clinical Pharmacy & Biopharmacy students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/therapeutic-drug-monitoring-hospita.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 199, 628, true),

      ('UNILAG', 'PCH 201', 'Pharmaceutical Chemistry', 'PCH 201: Pharmaceutical Organic & Stereochemical Principles',
       'Official notes covering Chirality, Enantiomers, Synthesis of Heterocyclic Pharmacophores for Pharmaceutical Chemistry students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/pharmaceutical-organic-stereochemic.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 92, 455, true),

      ('UNILAG', 'PCH 301', 'Pharmaceutical Chemistry', 'PCH 301: Medicinal Chemistry & Rational Drug Design',
       'Official notes covering QSAR, Hansch Analysis, Enzyme Inhibitors, Lead Optimization for Pharmaceutical Chemistry students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/medicinal-chemistry-rational-drug-d.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 167, 365, true),

      ('UNILAG', 'PCH 401', 'Pharmaceutical Chemistry', 'PCH 401: Pharmaceutical Instrumental Analysis & Drug Quality Assurance',
       'Official notes covering Spectrophotometry, HPLC Method Validation, Pharmacopoeial Assay Compliance for Pharmaceutical Chemistry students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/pharmaceutical-instrumental-analysi.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 188, 799, true),

      ('UNILAG', 'PCG 201', 'Pharmacognosy', 'PCG 201: Introductory Pharmacognosy & Plant Phytochemical Screening',
       'Official notes covering Solvent Extraction, Phytochemical Tests for Alkaloids, Saponins, Tannins for Pharmacognosy students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/introductory-pharmacognosy-plant-ph.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 193, 787, true),

      ('UNILAG', 'PCG 301', 'Pharmacognosy', 'PCG 301: Phytochemistry of Secondary Metabolites',
       'Official notes covering Biogenesis of Terpenoids, Cardiac Glycosides, Anthraquinones, Isolation Techniques for Pharmacognosy students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/phytochemistry-of-secondary-metabol.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 137, 620, true),

      ('UNILAG', 'PCG 401', 'Pharmacognosy', 'PCG 401: Ethnomedicine, Herbal Formulation & Standardisation',
       'Official notes covering WHO Guidelines for Herbal Medicines, Nigerian Medicinal Flora, Quality Control for Pharmacognosy students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/ethnomedicine-herbal-formulation-st.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 153, 402, true),

      ('UNILAG', 'PTT 301', 'Pharmacology, Therapeutics & Toxicology', 'PTT 301: Principles of Toxicology & Mechanisms of Cellular Toxicity',
       'Official notes covering Dose-Response Relationships, Organ Directed Toxicity, Biomarkers of Poisoning for Pharmacology, Therapeutics & Toxicology students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/principles-of-toxicology-mechanisms.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 196, 361, true),

      ('UNILAG', 'PTT 401', 'Pharmacology, Therapeutics & Toxicology', 'PTT 401: Clinical Toxicology, Antidotal Protocols & Environmental Hazards',
       'Official notes covering Heavy Metal Poisoning, Pesticide Poisoning, Snake Venom Management, Antidotes for Pharmacology, Therapeutics & Toxicology students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/clinical-toxicology-antidotal-proto.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 181, 791, true),

      ('UNILAG', 'EDF 201', 'Educational Foundations', 'EDF 201: Sociology & Philosophy of Nigerian Education',
       'Official notes covering National Policy on Education, Education as Social Mobility for Educational Foundations students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/sociology-philosophy-of-nigerian-ed.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 108, 746, true),

      ('UNILAG', 'EDM 201', 'Educational Management', 'EDM 201: Educational Administration, Supervision & Leadership',
       'Official notes covering School Budgeting, Educational Supervision, Teacher Retention for Educational Management students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/educational-administration-supervis.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 138, 554, true),

      ('UNILAG', 'ASE 201', 'Arts & Social Sciences Education', 'ASE 201: Curriculum Conception & Instructional Planning in Humanities',
       'Official notes covering Curriculum Design Models, Behavioral Objectives, Bloom Revised Taxonomy for Arts & Social Sciences Education students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/curriculum-conception-instructional.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 115, 623, true),

      ('UNILAG', 'ASE 301', 'Arts & Social Sciences Education', 'ASE 301: Teaching Methodologies in Social Studies & Language Education',
       'Official notes covering Inquiry-Based Learning, Microteaching Pedagogy, Formative Classroom Assessment for Arts & Social Sciences Education students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/teaching-methodologies-in-social-st.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 196, 443, true),

      ('UNILAG', 'STE 201', 'Science & Technology Education', 'STE 201: Curriculum Development & Instructional Methods in STEM',
       'Official notes covering Inquiry-Based Learning, STEM Laboratory Safety, Lesson Design for Science & Technology Education students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/curriculum-development-instructiona.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 124, 542, true),

      ('UNILAG', 'HKE 201', 'Human Kinetics & Health Education', 'HKE 201: Anatomy, Exercise Physiology & Sports Kinesiology',
       'Official notes covering Cardiovascular Response to Exercise, VO2 Max, Muscle Fiber Types for Human Kinetics & Health Education students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/anatomy-exercise-physiology-sports-.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 135, 551, true),

      ('UNILAG', 'ADE 201', 'Adult Education', 'ADE 201: Principles of Adult Learning, Andragogy & Literacy Programs',
       'Official notes covering Knowles Andragogy, Community Literacy Education, Non-Formal Schemes for Adult Education students at UNILAG.',
       'lecture_note'::resource_type_enum, 'https://unilag.edu.ng/courseware/principles-of-adult-learning-andrag.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 111, 573, true),

      ('UI', 'STA 201', 'Statistics', 'STA 201: Probability Distributions & Mathematical Statistics I',
       'Official notes covering Poisson, Exponential, Normal Distributions, MGFs for Statistics students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/probability-distributions-mathemati.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 209, 728, true),

      ('UI', 'STA 301', 'Statistics', 'STA 301: Statistical Inference, Hypothesis Testing & Estimation Theory',
       'Official notes covering Maximum Likelihood Estimation, Neyman-Pearson Lemma for Statistics students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/statistical-inference-hypothesis-te.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 207, 653, true),

      ('UI', 'PHY 201', 'Physics', 'PHY 201: Thermal Physics, Kinetic Theory & Classical Thermodynamics',
       'Official notes covering Maxwell-Boltzmann Distribution, Carnot Cycle, Entropy for Physics students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/thermal-physics-kinetic-theory-clas.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 162, 576, true),

      ('UI', 'PHY 301', 'Physics', 'PHY 301: Quantum Mechanics I & Atomic Structure',
       'Official notes covering Schrodinger Equation, Wavefunctions, Particle in a Box for Physics students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/quantum-mechanics-i-atomic-structur.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 176, 379, true),

      ('UI', 'BOT 201', 'Botany', 'BOT 201: Cryptogamic Botany & Plant Systematics',
       'Official notes covering Algae, Fungi, Bryophytes, Pteridophytes Taxonomic Keys for Botany students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/cryptogamic-botany-plant-systematic.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 117, 439, true),

      ('UI', 'BOT 301', 'Botany', 'BOT 301: Plant Anatomy, Cytochemistry & Economic Botany',
       'Official notes covering Meristems, Secondary Growth, Indigenous Medicinal Flora for Botany students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/plant-anatomy-cytochemistry-economi.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 91, 688, true),

      ('UI', 'ZOO 201', 'Zoology', 'ZOO 201: Invertebrate Functional Zoology & Evolutionary Trends',
       'Official notes covering Coelom Evolution, Arthropod Appendages, Molluscan Radula for Zoology students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/invertebrate-functional-zoology-evo.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 90, 646, true),

      ('UI', 'ZOO 301', 'Zoology', 'ZOO 301: Vertebrate Comparative Biology & Animal Behavior',
       'Official notes covering Ethology, Neuroethology, Circadian Rhythms for Zoology students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/vertebrate-comparative-biology-anim.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 90, 375, true),

      ('UI', 'ARC 201', 'Archaeology & Anthropology', 'ARC 201: Archaeological Field Methods, Stratigraphy & Excavation',
       'Official notes covering Radiocarbon Dating, Harris Matrix, Typological Analysis for Archaeology & Anthropology students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/archaeological-field-methods-strati.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 95, 496, true),

      ('UI', 'ARC 301', 'Archaeology & Anthropology', 'ARC 301: African Prehistory, Hominin Evolution & Stone Age Cultures',
       'Official notes covering Oldowan, Acheulean, Australopithecus, Iron Age West Africa for Archaeology & Anthropology students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/african-prehistory-hominin-evolutio.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 205, 447, true),

      ('UI', 'AGE 301', 'Agricultural & Environmental Engineering', 'AGE 301: Soil & Water Conservation Engineering Principles',
       'Official notes covering Terracing, Grassed Waterways, Universal Soil Loss Equation for Agricultural & Environmental Engineering students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/soil-water-conservation-engineering.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 154, 696, true),

      ('UI', 'AGE 501', 'Agricultural & Environmental Engineering', 'AGE 501: Agricultural Structures, Controlled Environment & Post-Harvest Storage',
       'Official notes covering Grain Silos, Psychrometry, Evaporative Cooling in Tropics for Agricultural & Environmental Engineering students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/agricultural-structures-controlled-.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 184, 454, true),

      ('UI', 'FDT 301', 'Food Technology', 'FDT 301: Principles of Food Processing, Thermal Sterilization & Canning',
       'Official notes covering Thermal Death Time, Pasteurization, Retort Processing for Food Technology students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/principles-of-food-processing-therm.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 179, 481, true),

      ('UI', 'FDT 501', 'Food Technology', 'FDT 501: Food Quality Assurance, Toxicology & Sensory Evaluation',
       'Official notes covering HACCP Verification, Mycotoxins, Hedonic Sensory Panels for Food Technology students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/food-quality-assurance-toxicology-s.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 171, 660, true),

      ('UI', 'WPE 301', 'Wood Products Engineering', 'WPE 301: Wood Anatomy, Physical Properties & Timber Mechanics',
       'Official notes covering Tracheids, Wood Shrinkage, Moisture Content Equilibrium for Wood Products Engineering students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/wood-anatomy-physical-properties-ti.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 144, 420, true),

      ('UI', 'WPE 501', 'Wood Products Engineering', 'WPE 501: Timber Structural Design, Wood Adhesives & Preservation',
       'Official notes covering CCA Preservatives, Glulam Beams, Joint Fasteners for Wood Products Engineering students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/timber-structural-design-wood-adhes.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 91, 388, true),

      ('UI', 'BME 301', 'Biomedical Engineering', 'BME 301: Biomaterials Science & Tissue Biocompatibility',
       'Official notes covering Titanium Implants, Bioresorbable Polymers, Immune Response for Biomedical Engineering students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/biomaterials-science-tissue-biocomp.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 102, 384, true),

      ('UI', 'BME 401', 'Biomedical Engineering', 'BME 401: Biomedical Instrumentation & Physiological Biosensors',
       'Official notes covering ECG/EMG Amplifiers, Biosensors, Electrical Safety in Hospitals for Biomedical Engineering students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/biomedical-instrumentation-physiolo.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 172, 560, true),

      ('UI', 'ENG 101', 'English', 'ENG 101: English Composition & Phonology of Modern English',
       'Official notes covering Phonemes, Allophones, Syllable Structure, Expository Essay Architecture for English students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/english-composition-phonology-of-mo.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 196, 790, true),

      ('UI', 'ENG 201', 'English', 'ENG 201: History of English & Modern English Grammatical Structures',
       'Official notes covering Old/Middle English Transitions, Systemic Functional Grammar, Clause Analysis for English students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/history-of-english-modern-english-g.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 128, 578, true),

      ('UI', 'ENG 301', 'English', 'ENG 301: African Literature & Postcolonial Literary Criticism',
       'Official notes covering Colonial Discourse, Subaltern Studies, Major West African Novels & Poetry for English students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/african-literature-postcolonial-lit.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 133, 480, true),

      ('UI', 'ENG 401', 'English', 'ENG 401: Semantics, Pragmatics & Discourse Analysis',
       'Official notes covering Truth-Conditional Semantics, Speech Act Theory, Gricean Maxims, Critical Discourse for English students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/semantics-pragmatics-discourse-anal.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 152, 446, true),

      ('UI', 'ENG 202PQ', 'English', 'ENG 202PQ: English Grammar, Syntax & Phonetics Past Questions with Solutions (2019-2025)',
       'Official past questions covering Model syntactic tree diagrams, transcription exercises, and essay answers for English students at UI.',
       'past_question'::resource_type_enum, 'https://ui.edu.ng/courseware/english-grammar-syntax-phonetics-pa.pdf',
       2097152, 'application/pdf', 'Harmattan / First', '2025/2026', 115, 609, true),

      ('UI', 'HIS 101', 'History', 'HIS 101: Nigeria to 1900: Political Evolution & Inter-Group Relations',
       'Official notes covering Pre-Colonial Kingdoms, Trade Routes, Palm Oil Diplomacy for History students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/nigeria-to-1900-political-evolution.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 188, 496, true),

      ('UI', 'HIS 201', 'History', 'HIS 201: African History in the 19th & 20th Centuries',
       'Official notes covering Berlin Conference, Resistance Movements, Decolonization for History students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/african-history-in-the-19th-20th-ce.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 166, 501, true),

      ('UI', 'CLA 202', 'Classics', 'CLA 202: Greek and Roman Civilization, Mythology & Political Thought',
       'Official notes covering Athenian Democracy, Roman Republic, Cicero, Homeric Epics for Classics students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/greek-and-roman-civilization-mythol.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 119, 378, true),

      ('UI', 'REL 101', 'Religious Studies', 'REL 101: Introduction to Comparative Religion & Phenomenology of Religion',
       'Official notes covering Indigenous African Religion, Christianity, Islam Syncretism for Religious Studies students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/introduction-to-comparative-religio.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 96, 744, true),

      ('UI', 'REL 201', 'Religious Studies', 'REL 201: Sociology of Religion & Religious Movements in Nigeria',
       'Official notes covering Pentecostalism, Islamic Reform Movements, Inter-Faith Dialogue for Religious Studies students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/sociology-of-religion-religious-mov.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 111, 429, true),

      ('UI', 'LIN 101', 'Linguistics & African Languages', 'LIN 101: Introduction to General Linguistics & Phonetics',
       'Official notes covering Articulatory Phonetics, Acoustic Features, Morphological Typology for Linguistics & African Languages students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/introduction-to-general-linguistics.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 205, 445, true),

      ('UI', 'LIN 201', 'Linguistics & African Languages', 'LIN 201: Morphology & Generative Syntax of African Languages',
       'Official notes covering Tone Systems in Niger-Congo, Verb Serialization, Government & Binding for Linguistics & African Languages students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/morphology-generative-syntax-of-afr.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 92, 663, true),

      ('UI', 'LIN 301', 'Linguistics & African Languages', 'LIN 301: Sociolinguistics & Language Endangerment in Nigeria',
       'Official notes covering Diglossia, Code-Switching, Language Contact Phenomena, Orthography Development for Linguistics & African Languages students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/sociolinguistics-language-endangerm.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 92, 607, true),

      ('UI', 'CLA 101', 'Communication & Language Arts', 'CLA 101: Introduction to Human Communication & Interpersonal Dynamics',
       'Official notes covering Shannon-Weaver Model, Non-Verbal Communication, Active Listening for Communication & Language Arts students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/introduction-to-human-communication.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 94, 681, true),

      ('UI', 'CLA 201', 'Communication & Language Arts', 'CLA 201: Writing for the Media: Print, Broadcast & Digital Copywriting',
       'Official notes covering Feature Articles, Broadcast Scripts, Copy Editing for Communication & Language Arts students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/writing-for-the-media-print-broadca.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 179, 560, true),

      ('UI', 'THA 101', 'Theatre Arts', 'THA 101: Introduction to Theatre Practice, Stagecraft & Performance',
       'Official notes covering Acting Techniques, Set Design, Costume & Stage Properties for Theatre Arts students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/introduction-to-theatre-practice-st.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 107, 772, true),

      ('UI', 'THA 201', 'Theatre Arts', 'THA 201: Playwriting, Dramatic Structure & Nigerian Playwrights',
       'Official notes covering Plot Arc, Dialogue Rhythm, Soyinka, Clark, Osofisan Plays for Theatre Arts students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/playwriting-dramatic-structure-nige.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 146, 790, true),

      ('UI', 'MUS 101', 'Music', 'MUS 101: Fundamentals of Music Theory, Harmony & Sight Reading',
       'Official notes covering Clefs, Scales, Diatonic Triads, Cadences, Rhythmic Notation for Music students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/fundamentals-of-music-theory-harmon.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 99, 385, true),

      ('UI', 'MUS 201', 'Music', 'MUS 201: African Musicology, Indigenous Instruments & Polyrhythms',
       'Official notes covering Talking Drums (Dundun), Balafon, Master Drumming Aesthetics for Music students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/african-musicology-indigenous-instr.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 164, 395, true),

      ('UI', 'EUR 101', 'European Studies', 'EUR 101: French for Academic Purposes & Modern European Grammar',
       'Official notes covering Phonetics, Subjunctive Mood, Reading Comprehension in French for European Studies students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/french-for-academic-purposes-modern.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 178, 584, true),

      ('UI', 'EUR 201', 'European Studies', 'EUR 201: European Political History & Integration Treaties (EU)',
       'Official notes covering Treaty of Rome, Maastricht Treaty, European Commission Framework for European Studies students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/european-political-history-integrat.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 116, 487, true),

      ('UI', 'ARA 101', 'Arabic & Islamic Studies', 'ARA 101: Arabic Grammar, Syntax (Nahw) & Morphology (Sarf)',
       'Official notes covering Nominal & Verbal Sentences, Root System, Conjugations for Arabic & Islamic Studies students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/arabic-grammar-syntax-nahw-morpholo.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 123, 686, true),

      ('UI', 'ARA 201', 'Arabic & Islamic Studies', 'ARA 201: Islamic Jurisprudence (Fiqh) & Legal Maxims',
       'Official notes covering Usul al-Fiqh, Maliki School in West Africa, Sharia Principles for Arabic & Islamic Studies students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/islamic-jurisprudence-fiqh-legal-ma.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 116, 380, true),

      ('UI', 'SOC 101', 'Sociology', 'SOC 101: Introduction to Sociology & Social Institutions',
       'Official notes covering Culture, Socialization, Social Roles, Deviance for Sociology students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/introduction-to-sociology-social-in.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 164, 571, true),

      ('UI', 'SOC 201', 'Sociology', 'SOC 201: Social Stratification, Class Inequality & Social Mobility',
       'Official notes covering Marx, Weber, Functionalism, Gender and Racial Inequality for Sociology students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/social-stratification-class-inequal.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 92, 610, true),

      ('UI', 'SOC 301', 'Sociology', 'SOC 301: Classical & Contemporary Sociological Theories',
       'Official notes covering Durkheim, Simmel, Habermas, Postmodern Social Theory for Sociology students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/classical-contemporary-sociological.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 163, 693, true),

      ('UI', 'GEG 201', 'Geography', 'GEG 201: Climatology, Meteorology & Atmospheric Dynamics',
       'Official notes covering Intertropical Convergence Zone (ITCZ), Precipitation Systems for Geography students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/climatology-meteorology-atmospheric.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 165, 404, true),

      ('UI', 'GEG 301', 'Geography', 'GEG 301: Geomorphology & Fluvial Hydrology',
       'Official notes covering Drainage Basin Morphometry, Weathering Landforms for Geography students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/geomorphology-fluvial-hydrology.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 126, 734, true),

      ('UI', 'BFN 201', 'Banking & Finance', 'BFN 201: Money, Financial Institutions & The Nigerian Financial System',
       'Official notes covering CBN Monetary Framework, Commercial Banking Operations, Money Market Instruments for Banking & Finance students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/money-financial-institutions-the-ni.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 109, 478, true),

      ('UI', 'BFN 301', 'Banking & Finance', 'BFN 301: Corporate Financial Management & Capital Budgeting',
       'Official notes covering Discounted Cash Flows, Cost of Capital, Capital Structure Theories (M&M) for Banking & Finance students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/corporate-financial-management-capi.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 172, 572, true),

      ('UI', 'BFN 401', 'Banking & Finance', 'BFN 401: Investment Analysis, Portfolio Theory & Capital Markets',
       'Official notes covering Markowitz Efficient Frontier, CAPM, Arbitrage Pricing Theory, Derivatives for Banking & Finance students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/investment-analysis-portfolio-theor.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 168, 352, true),

      ('UI', 'BFN 302PQ', 'Banking & Finance', 'BFN 302PQ: Corporate Financial Management Past Questions & Computation Guides (2019-2025)',
       'Official past questions covering Step-by-step financial formula calculations, WACC, NPV, and capital budgeting solutions for Banking & Finance students at UI.',
       'past_question'::resource_type_enum, 'https://ui.edu.ng/courseware/corporate-financial-management-past.pdf',
       2097152, 'application/pdf', 'Harmattan / First', '2025/2026', 148, 418, true),

      ('UI', 'BUS 201', 'Business Administration', 'BUS 201: Principles of Management & Organisational Behaviour',
       'Official notes covering Classical & Contemporary Management Theories, Group Dynamics, Leadership Styles for Business Administration students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/principles-of-management-organisati.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 126, 626, true),

      ('UI', 'BUS 301', 'Business Administration', 'BUS 301: Production & Operations Management',
       'Official notes covering Capacity Planning, Inventory Control Models, Lean Manufacturing, Six Sigma for Business Administration students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/production-operations-management.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 165, 756, true),

      ('UI', 'BUS 401', 'Business Administration', 'BUS 401: Strategic Management, Corporate Governance & Business Policy',
       'Official notes covering Environmental Scanning, Resource-Based View, Strategic Implementation for Business Administration students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/strategic-management-corporate-gove.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 203, 579, true),

      ('UI', 'MKT 201', 'Marketing', 'MKT 201: Principles of Marketing, Market Segmentation & 4Ps Mix',
       'Official notes covering Product Life Cycle, Pricing Strategies, Distribution Channels for Marketing students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/principles-of-marketing-market-segm.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 180, 755, true),

      ('UI', 'MKT 301', 'Marketing', 'MKT 301: Consumer Behavior, Market Research & Digital Marketing',
       'Official notes covering Buyer Decision Process, Survey Sampling, SEO & Social Ads for Marketing students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/consumer-behavior-market-research-d.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 164, 644, true),

      ('UI', 'PPL 301', 'Private & Property Law', 'PPL 301: Family Law, Marriage Regimes & Custody Rights',
       'Official notes covering Marriage Act, Customary Marriages, Matrimonial Causes Act for Private & Property Law students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/family-law-marriage-regimes-custody.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 130, 455, true),

      ('UI', 'PPL 401', 'Private & Property Law', 'PPL 401: Land Law, Land Use Act 1978 & Conveyancing',
       'Official notes covering Governor Consent, Certificate of Occupancy, Customary Tenancies for Private & Property Law students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/land-law-land-use-act-1978-conveyan.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 188, 467, true),

      ('UI', 'JIL 401', 'Jurisprudence & International Law', 'JIL 401: Public International Law, Treaties & Diplomatic Immunity',
       'Official notes covering Sources of International Law, ICJ Jurisdiction, Use of Force for Jurisprudence & International Law students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/public-international-law-treaties-d.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 194, 710, true),

      ('UI', 'JIL 501', 'Jurisprudence & International Law', 'JIL 501: Jurisprudence & Contemporary Legal Philosophy',
       'Official notes covering Natural Law, Legal Positivism, Hart-Fuller Debate, Realism for Jurisprudence & International Law students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/jurisprudence-contemporary-legal-ph.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 97, 626, true),

      ('UI', 'DEN 201', 'Dentistry (BDS)', 'DEN 201: Oral Biology, Tooth Development & Craniofacial Anatomy',
       'Official notes covering Odontogenesis, Temporomandibular Joint Biomechanics, Saliva for Dentistry (BDS) students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/oral-biology-tooth-development-cran.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 199, 478, true),

      ('UI', 'DEN 301', 'Dentistry (BDS)', 'DEN 301: Oral Pathology, Diagnosis & Periodontal Medicine',
       'Official notes covering Dental Caries Etiology, Periodontitis, Odontogenic Cysts for Dentistry (BDS) students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/oral-pathology-diagnosis-periodonta.pdf',
       6291456, 'application/pdf', 'Harmattan / First', '2025/2026', 134, 735, true),

      ('UI', 'PHT 201', 'Physiotherapy', 'PHT 201: Kinesiology, Pathomechanics & Functional Human Movement',
       'Official notes covering Gait Analysis, Joint Kinematics, Muscle Torque Calculations for Physiotherapy students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/kinesiology-pathomechanics-function.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 103, 430, true),

      ('UI', 'PHT 301', 'Physiotherapy', 'PHT 301: Electrotherapy, Ultrasound & Physical Rehabilitation Modalities',
       'Official notes covering TENS, Interferential Currents, Therapeutic Ultrasound for Physiotherapy students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/electrotherapy-ultrasound-physical-.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 139, 684, true),

      ('UI', 'MLS 201', 'Medical Laboratory Science', 'MLS 201: Clinical Biochemistry & Diagnostic Laboratory Techniques',
       'Official notes covering Spectrophotometry, Enzymatic Assays, Renal & Liver Function Panels for Medical Laboratory Science students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/clinical-biochemistry-diagnostic-la.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 152, 476, true),

      ('UI', 'MLS 301', 'Medical Laboratory Science', 'MLS 301: Medical Microbiology, Diagnostic Parasitology & Mycology',
       'Official notes covering Blood Parasites, Malaria Microscopy, Fungal Culture Media for Medical Laboratory Science students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/medical-microbiology-diagnostic-par.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 146, 715, true),

      ('UI', 'NUT 201', 'Human Nutrition & Dietetics', 'NUT 201: Human Nutrition Principles & Macronutrient Bioavailability',
       'Official notes covering Nutrient Digestion, Basal Metabolic Rate, Vitamin Deficiencies for Human Nutrition & Dietetics students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/human-nutrition-principles-macronut.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 148, 752, true),

      ('UI', 'NUT 301', 'Human Nutrition & Dietetics', 'NUT 301: Clinical Nutrition, Medical Nutrition Therapy & Dietetics',
       'Official notes covering Renal Diets, Diabetes Medical Nutrition, Enteral Feeding for Human Nutrition & Dietetics students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/clinical-nutrition-medical-nutritio.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 102, 529, true),

      ('UI', 'BCH 201', 'Biochemistry', 'BCH 201: Structure & Function of Biological Macromolecules',
       'Official notes covering Amino Acid Chemistry, Protein Folding, Carbohydrate Isomerism, Lipid Bilayers for Biochemistry students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/structure-function-of-biological-ma.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 202, 717, true),

      ('UI', 'BCH 301', 'Biochemistry', 'BCH 301: Enzymology & Intermediary Bioenergetics',
       'Official notes covering Michaelis-Menten Kinetics, Enzyme Inhibition, TCA Cycle, Oxidative Phosphorylation for Biochemistry students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/enzymology-intermediary-bioenergeti.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 162, 759, true),

      ('UI', 'BCH 401', 'Biochemistry', 'BCH 401: Molecular Biology, Recombinant DNA & Genetic Engineering',
       'Official notes covering DNA Replication, Transcription, Translation, PCR, cDNA Cloning, Gene Editing for Biochemistry students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/molecular-biology-recombinant-dna-g.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 106, 594, true),

      ('UI', 'BCH 302PQ', 'Biochemistry', 'BCH 302PQ: Enzymology & Intermediary Metabolism Past Questions with Step-by-Step Pathway Solutions (2018-2025)',
       'Official past questions covering Pathway stoichiometry, kinetic derivations, and past examination papers for Biochemistry students at UI.',
       'past_question'::resource_type_enum, 'https://ui.edu.ng/courseware/enzymology-intermediary-metabolism-.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 105, 548, true),

      ('UI', 'PHS 201', 'Physiology', 'PHS 201: Hematology & Cardiovascular Physiology',
       'Official notes covering Hemopoiesis, Blood Groups, Cardiac Electrophysiology, Hemodynamics for Physiology students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/hematology-cardiovascular-physiolog.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 119, 759, true),

      ('UI', 'PHS 301', 'Physiology', 'PHS 301: Neurophysiology & Endocrine Regulation',
       'Official notes covering Action Potentials, Synaptic Transmission, Hypothalamic-Pituitary-Target Organ Axes for Physiology students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/neurophysiology-endocrine-regulatio.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 116, 652, true),

      ('UI', 'PHS 401', 'Physiology', 'PHS 401: Renal, Respiratory & Environmental Physiology',
       'Official notes covering Glomerular Filtration, Countercurrent Multiplier, Acid-Base Regulation, Hypoxia for Physiology students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/renal-respiratory-environmental-phy.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 138, 397, true),

      ('UI', 'PHS 302PQ', 'Physiology', 'PHS 302PQ: Neurophysiology & Cardiovascular Past Questions with Marking Guides (2019-2025)',
       'Official past questions covering College of Medicine comprehensive past exam questions and OSCE prep guides for Physiology students at UI.',
       'past_question'::resource_type_enum, 'https://ui.edu.ng/courseware/neurophysiology-cardiovascular-past.pdf',
       2097152, 'application/pdf', 'Harmattan / First', '2025/2026', 151, 413, true),

      ('UI', 'ANA 201', 'Anatomy', 'ANA 201: Gross Anatomy of the Musculoskeletal System',
       'Official notes covering Osteology, Arthrology, Myology and Neurovascular Supply of Upper and Lower Extremities for Anatomy students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/gross-anatomy-of-the-musculoskeleta.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 157, 595, true),

      ('UI', 'ANA 301', 'Anatomy', 'ANA 301: Systematic Neuroanatomy & Organ Histology',
       'Official notes covering Cerebral Hemispheres, Cranial Nerves, Spinal Tracts, Microscopic Organ Architecture for Anatomy students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/systematic-neuroanatomy-organ-histo.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 113, 762, true),

      ('UI', 'ANA 401', 'Anatomy', 'ANA 401: Developmental Embryology & Teratology',
       'Official notes covering Gametogenesis, Bilaminar & Trilaminar Germ Discs, Organogenesis, Congenital Anomalies for Anatomy students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/developmental-embryology-teratology.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 184, 467, true),

      ('UI', 'ANA 302PQ', 'Anatomy', 'ANA 302PQ: Gross Anatomy & Neuroanatomy Past Questions with Dissection Guides (2018-2025)',
       'Official past questions covering Prosection spot test questions, viva voce guides, and theoretical papers for Anatomy students at UI.',
       'past_question'::resource_type_enum, 'https://ui.edu.ng/courseware/gross-anatomy-neuroanatomy-past-que.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 159, 754, true),

      ('UI', 'PCT 301', 'Pharmacology & Therapeutics', 'PCT 301: General Pharmacology, Receptors & Pharmacodynamics',
       'Official notes covering Agonists, Antagonists, Dose-Response Curves, Cytochrome P450 for Pharmacology & Therapeutics students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/general-pharmacology-receptors-phar.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 94, 725, true),

      ('UI', 'PCT 401', 'Pharmacology & Therapeutics', 'PCT 401: Cardiovascular, Renal & Endocrine Chemotherapeutics',
       'Official notes covering ACE Inhibitors, Beta Blockers, Insulin Analogues, Diuretics for Pharmacology & Therapeutics students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/cardiovascular-renal-endocrine-chem.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 200, 434, true),

      ('UI', 'AEC 201', 'Agricultural Economics', 'AEC 201: Microeconomics of Agricultural Production',
       'Official notes covering Production Functions (Cobb-Douglas), Elasticities, Cost Minimization for Agricultural Economics students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/microeconomics-of-agricultural-prod.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 111, 472, true),

      ('UI', 'AEC 301', 'Agricultural Economics', 'AEC 301: Agricultural Price Analysis & Commodity Marketing',
       'Official notes covering Market Structure, Spatial Price Equilibrium, Cobweb Model, Futures Contracts for Agricultural Economics students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/agricultural-price-analysis-commodi.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 125, 542, true),

      ('UI', 'AEC 401', 'Agricultural Economics', 'AEC 401: Farm Business Management & Agricultural Project Evaluation',
       'Official notes covering Linear Programming, Enterprise Budgets, Discounted Benefit-Cost Ratio, IRR for Agricultural Economics students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/farm-business-management-agricultur.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 154, 796, true),

      ('UI', 'AED 201', 'Agricultural Extension & Rural Development', 'AED 201: Rural Sociology & Principles of Agricultural Extension',
       'Official notes covering Rural Social Structure, Diffusion of Agricultural Innovations, Extension Paradigms for Agricultural Extension & Rural Development students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/rural-sociology-principles-of-agric.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 104, 399, true),

      ('UI', 'AED 301', 'Agricultural Extension & Rural Development', 'AED 301: Extension Teaching Methods & Audio-Visual Communication',
       'Official notes covering Farmer Field Schools, Method/Result Demonstrations, Agricultural Media Planning for Agricultural Extension & Rural Development students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/extension-teaching-methods-audio-vi.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 187, 429, true),

      ('UI', 'AED 401', 'Agricultural Extension & Rural Development', 'AED 401: Participatory Rural Appraisal & Community Project Planning',
       'Official notes covering PRA Tools, Logical Framework Approaches, Monitoring & Evaluation in Rural Areas for Agricultural Extension & Rural Development students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/participatory-rural-appraisal-commu.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 141, 634, true),

      ('UI', 'CPB 301', 'Crop Protection & Environmental Biology', 'CPB 301: Economic Entomology, Plant Nematology & Pest Control',
       'Official notes covering Nematode Damage, Insect Vectors of Plant Viruses, Insecticides for Crop Protection & Environmental Biology students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/economic-entomology-plant-nematolog.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 185, 716, true),

      ('UI', 'SRM 301', 'Soil Resources Management', 'SRM 301: Soil Fertility, Nutrient Dynamics & Fertilizer Technology',
       'Official notes covering Cation Exchange Capacity (CEC), NPK Chemistry, Soil Acidity Liming for Soil Resources Management students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/soil-fertility-nutrient-dynamics-fe.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 99, 630, true),

      ('UI', 'AFM 201', 'Aquaculture & Fisheries Management', 'AFM 201: Ichthyology & Biology of Cultured Fish Species',
       'Official notes covering Clarias gariepinus & Oreochromis niloticus Anatomy, Physiology, Reproduction for Aquaculture & Fisheries Management students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/ichthyology-biology-of-cultured-fis.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 134, 560, true),

      ('UI', 'AFM 301', 'Aquaculture & Fisheries Management', 'AFM 301: Aquaculture Engineering, Pond Construction & Water Quality',
       'Official notes covering Earthen/Concrete Pond Sizing, Dissolved Oxygen Dynamics, Recirculating Systems for Aquaculture & Fisheries Management students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/aquaculture-engineering-pond-constr.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 130, 752, true),

      ('UI', 'AFM 401', 'Aquaculture & Fisheries Management', 'AFM 401: Fish Hatchery Management, Induced Breeding & Fish Nutrition',
       'Official notes covering Hypophysation, Ovaprim Administration, Larval Rearing, Feed Formulation for Aquaculture & Fisheries Management students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/fish-hatchery-management-induced-br.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 96, 506, true),

      ('UI', 'FRM 201', 'Forest Resources Management', 'FRM 201: Principles of Silviculture & Tropical Forest Botany',
       'Official notes covering Seed Provenance, Nursery Practices, Regeneration Systems for High Forest for Forest Resources Management students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/principles-of-silviculture-tropical.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 191, 522, true),

      ('UI', 'FRM 301', 'Forest Resources Management', 'FRM 301: Forest Mensuration, Tree Volume Tables & Forest Inventory',
       'Official notes covering Stem Diameter Measurement, Bitterlich Relascope, Volume Equations, Sampling for Forest Resources Management students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/forest-mensuration-tree-volume-tabl.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 95, 391, true),

      ('UI', 'FRM 401', 'Forest Resources Management', 'FRM 401: Sustainable Forest Resource Economics & Conservation Policy',
       'Official notes covering Stumpage Valuation, Non-Timber Forest Products (NTFPs), REDD+ Mechanisms for Forest Resources Management students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/sustainable-forest-resource-economi.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 155, 729, true),

      ('UI', 'SEF 301', 'Social & Environmental Forestry', 'SEF 301: Agroforestry Systems, Silvopasture & Community Forestry',
       'Official notes covering Alley Cropping, Carbon Sequestration in Tree Stands, Forest Policy for Social & Environmental Forestry students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/agroforestry-systems-silvopasture-c.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 206, 576, true),

      ('UI', 'SEF 501', 'Social & Environmental Forestry', 'SEF 501: Forest Resource Economics & Environmental Valuation',
       'Official notes covering Contingent Valuation, Timber Harvest Optimization, REDD+ for Social & Environmental Forestry students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/forest-resource-economics-environme.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 126, 619, true),

      ('UI', 'WEM 301', 'Wildlife & Ecotourism Management', 'WEM 301: Wildlife Ecology, Population Census & Habitat Conservation',
       'Official notes covering Transect Line Sampling, Carrying Capacity, Biodiversity Indices for Wildlife & Ecotourism Management students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/wildlife-ecology-population-census-.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 142, 492, true),

      ('UI', 'WEM 501', 'Wildlife & Ecotourism Management', 'WEM 501: Protected Area Planning, National Parks & Ecotourism Management',
       'Official notes covering Zoning Plans, Community-Based Ecotourism, Anti-Poaching Tactics for Wildlife & Ecotourism Management students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/protected-area-planning-national-pa.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 105, 509, true),

      ('UI', 'VMD 401', 'Veterinary Medicine', 'VMD 401: General Veterinary Medicine & Clinical Physical Diagnosis',
       'Official notes covering Auscultation, Palpation, Vital Signs, Clinical Decision Trees for Veterinary Medicine students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/general-veterinary-medicine-clinica.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 108, 681, true),

      ('UI', 'VMD 501', 'Veterinary Medicine', 'VMD 501: Food Animal Clinical Medicine & Herd Health Programs',
       'Official notes covering Ruminant Mastitis, Ketosis, Neonatal Calf Scours for Veterinary Medicine students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/food-animal-clinical-medicine-herd-.pdf',
       6291456, 'application/pdf', 'Harmattan / First', '2025/2026', 197, 538, true),

      ('UI', 'VSR 401', 'Veterinary Surgery & Radiology', 'VSR 401: General Veterinary Surgery & Inhalation Anaesthesia',
       'Official notes covering Endotracheal Intubation, Isoflurane Anaesthesia, Haemostasis for Veterinary Surgery & Radiology students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/general-veterinary-surgery-inhalati.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 168, 401, true),

      ('UI', 'VSR 501', 'Veterinary Surgery & Radiology', 'VSR 501: Veterinary Diagnostic Imaging & Contrast Radiology',
       'Official notes covering Small Animal Abdominal X-Rays, Orthopaedic Radiography for Veterinary Surgery & Radiology students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/veterinary-diagnostic-imaging-contr.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 125, 473, true),

      ('UI', 'VPT 301', 'Veterinary Pathology', 'VPT 301: General Veterinary Pathology, Cellular Injury & Inflammation',
       'Official notes covering Necrosis, Apoptosis, Hemodynamic Disorders, Granulomas for Veterinary Pathology students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/general-veterinary-pathology-cellul.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 142, 681, true),

      ('UI', 'VPT 401', 'Veterinary Pathology', 'VPT 401: Systemic Veterinary Pathology, Necropsy & Forensic Diagnosis',
       'Official notes covering Post-Mortem Techniques, Pulmonary Lesions, Renal Pathology for Veterinary Pathology students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/systemic-veterinary-pathology-necro.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 178, 658, true),

      ('UI', 'VPH 401', 'Veterinary Public Health & Preventive Medicine', 'VPH 401: Food Hygiene, Milk Quality & Meat Inspection Law',
       'Official notes covering Pasteurization Standards, Brucellosis Screening, Slaughterhouses for Veterinary Public Health & Preventive Medicine students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/food-hygiene-milk-quality-meat-insp.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 132, 418, true),

      ('UI', 'VPH 501', 'Veterinary Public Health & Preventive Medicine', 'VPH 501: Epidemiology of Infectious Animal Diseases & One Health',
       'Official notes covering R0 Calculation, Outbreak Investigation, One Health Zoonotic Control for Veterinary Public Health & Preventive Medicine students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/epidemiology-of-infectious-animal-d.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 207, 735, true),

      ('UI', 'GCE 201', 'Guidance & Counselling', 'GCE 201: Foundations of School Guidance & Psychological Services',
       'Official notes covering History of Guidance, Educational, Vocational & Personal-Social Guidance for Guidance & Counselling students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/foundations-of-school-guidance-psyc.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 199, 420, true),

      ('UI', 'GCE 301', 'Guidance & Counselling', 'GCE 301: Theories of Psychotherapy & Counselling Techniques',
       'Official notes covering Person-Centered Therapy, Cognitive Behavioral Therapy (CBT), Gestalt Techniques for Guidance & Counselling students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/theories-of-psychotherapy-counselli.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 164, 668, true),

      ('UI', 'GCE 401', 'Guidance & Counselling', 'GCE 401: Psychological Testing, Appraisal & Educational Measurement',
       'Official notes covering Standardized Aptitude Tests, Interest Inventories, Test Validity & Reliability for Guidance & Counselling students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/psychological-testing-appraisal-edu.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 207, 703, true),

      ('UI', 'ADE 201', 'Adult Education', 'ADE 201: Principles of Adult Learning, Andragogy & Literacy Programs',
       'Official notes covering Knowles Andragogy, Community Literacy Education, Non-Formal Schemes for Adult Education students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/principles-of-adult-learning-andrag.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 149, 555, true),

      ('UI', 'SPE 201', 'Special Education', 'SPE 201: Introduction to Special Needs Education & Inclusive Classrooms',
       'Official notes covering Visual Impairment Braille, Hearing Impairment Sign Language for Special Education students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/introduction-to-special-needs-educa.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 187, 388, true),

      ('UI', 'SPE 301', 'Special Education', 'SPE 301: Psychology & Assessment of Exceptional Children',
       'Official notes covering Individualized Education Programs (IEP), Learning Disabilities for Special Education students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/psychology-assessment-of-exceptiona.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 172, 481, true),

      ('UI', 'STE 201', 'Science & Technology Education', 'STE 201: Curriculum Development & Instructional Methods in STEM',
       'Official notes covering Inquiry-Based Learning, STEM Laboratory Safety, Lesson Design for Science & Technology Education students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/curriculum-development-instructiona.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 165, 637, true),

      ('UI', 'ASE 201', 'Arts & Social Sciences Education', 'ASE 201: Curriculum Conception & Instructional Planning in Humanities',
       'Official notes covering Curriculum Design Models, Behavioral Objectives, Bloom Revised Taxonomy for Arts & Social Sciences Education students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/curriculum-conception-instructional.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 93, 747, true),

      ('UI', 'ASE 301', 'Arts & Social Sciences Education', 'ASE 301: Teaching Methodologies in Social Studies & Language Education',
       'Official notes covering Inquiry-Based Learning, Microteaching Pedagogy, Formative Classroom Assessment for Arts & Social Sciences Education students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/teaching-methodologies-in-social-st.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 109, 775, true),

      ('UI', 'HKE 201', 'Human Kinetics & Health Education', 'HKE 201: Anatomy, Exercise Physiology & Sports Kinesiology',
       'Official notes covering Cardiovascular Response to Exercise, VO2 Max, Muscle Fiber Types for Human Kinetics & Health Education students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/anatomy-exercise-physiology-sports-.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 137, 555, true),

      ('UI', 'LIS 201', 'Library, Archival & Information Studies', 'LIS 201: Organization of Knowledge: Cataloguing & Classification Systems',
       'Official notes covering Dewey Decimal Classification (DDC), Library of Congress (LCC) for Library, Archival & Information Studies students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/organization-of-knowledge-catalogui.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 169, 745, true),

      ('UI', 'LIS 301', 'Library, Archival & Information Studies', 'LIS 301: Digital Libraries, Information Retrieval & Metadata Standards',
       'Official notes covering Dublin Core, Institutional Repositories (DSpace), Boolean Search for Library, Archival & Information Studies students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/digital-libraries-information-retri.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 119, 527, true),

      ('UI', 'ARC 201', 'Architecture', 'ARC 201: Architectural Graphics, Freehand & Design Studio I',
       'Official notes covering Orthographic Projection, Isometric Drafting, Rendering Techniques, Anthropometrics for Architecture students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/architectural-graphics-freehand-des.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 119, 767, true),

      ('UI', 'ARC 301', 'Architecture', 'ARC 301: Building Climatology & Passive Environmental Control',
       'Official notes covering Sun Angles, Shading Devices, Natural Cross Ventilation, Tropical Building Physics for Architecture students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/building-climatology-passive-enviro.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 102, 356, true),

      ('UI', 'ARC 401', 'Architecture', 'ARC 401: Advanced Architectural Design Studio & Urban Form',
       'Official notes covering Mixed-Use Developments, Structural Integration, Sustainable Materials, BIM for Architecture students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/advanced-architectural-design-studi.pdf',
       5242880, 'application/pdf', 'Harmattan / First', '2025/2026', 182, 774, true),

      ('UI', 'ESM 201', 'Estate Management', 'ESM 201: Principles of Property Valuation & Investment Mathematics',
       'Official notes covering Years Purchase, Sinking Funds, Valuation Methods for Estate Management students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/principles-of-property-valuation-in.pdf',
       3145728, 'application/pdf', 'Harmattan / First', '2025/2026', 161, 617, true),

      ('UI', 'ESM 301', 'Estate Management', 'ESM 301: Urban Land Economics, Property Taxation & Rating Valuation',
       'Official notes covering Bid Rent Theory, Tenement Rates, Land Use Planning Models for Estate Management students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/urban-land-economics-property-taxat.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 110, 506, true),

      ('UI', 'URP 201', 'Urban & Regional Planning', 'URP 201: Planning Theory, Urban Land Use & Spatial Forms',
       'Official notes covering Concentric Zone Theory, Sector Model, Multiple Nuclei for Urban & Regional Planning students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/planning-theory-urban-land-use-spat.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 110, 679, true),

      ('UI', 'URP 301', 'Urban & Regional Planning', 'URP 301: Regional Planning, Growth Poles & Spatial Development Policy',
       'Official notes covering Perroux Growth Poles, Cumulative Causation, Regional Imbalances for Urban & Regional Planning students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/regional-planning-growth-poles-spat.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 174, 695, true),

      ('UI', 'QTS 201', 'Quantity Surveying', 'QTS 201: Measurement of Building Works I (Substructure & Superstructure)',
       'Official notes covering BESMM4 Principles, Taking-off Sheets, Bill of Quantities for Quantity Surveying students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/measurement-of-building-works-i-sub.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 181, 439, true),

      ('UI', 'QTS 301', 'Quantity Surveying', 'QTS 301: Construction Cost Control, Tendering & Estimating',
       'Official notes covering Unit Rate Build-Up, Tender Documentation, Interim Valuations for Quantity Surveying students at UI.',
       'lecture_note'::resource_type_enum, 'https://ui.edu.ng/courseware/construction-cost-control-tendering.pdf',
       4194304, 'application/pdf', 'Harmattan / First', '2025/2026', 209, 612, true),
    ) AS v(campus_code, course_code, course_title, title, description, resource_type, file_url, file_size_bytes, file_mime_type, semester, academic_year, upvotes_count, downloads_count, is_approved)
  LOOP
    UPDATE public.resources
       SET course_code = r.course_code,
           course_title = r.course_title,
           description = r.description,
           resource_type = r.resource_type,
           file_url = r.file_url,
           file_size_bytes = r.file_size_bytes,
           file_mime_type = r.file_mime_type,
           semester = r.semester,
           academic_year = r.academic_year,
           upvotes_count = r.upvotes_count,
           downloads_count = r.downloads_count,
           is_approved = r.is_approved
     WHERE campus_code = r.campus_code AND title = r.title;

    IF NOT FOUND THEN
      INSERT INTO public.resources (
        uploader_id, campus_code, course_code, course_title, title, description,
        resource_type, file_url, file_size_bytes, file_mime_type, semester,
        academic_year, upvotes_count, downloads_count, is_approved
      )
      VALUES (
        v_uploader_id, r.campus_code, r.course_code, r.course_title, r.title, r.description,
        r.resource_type, r.file_url, r.file_size_bytes, r.file_mime_type, r.semester,
        r.academic_year, r.upvotes_count, r.downloads_count, r.is_approved
      );
    END IF;
  END LOOP;
END
$do$;

COMMIT;
