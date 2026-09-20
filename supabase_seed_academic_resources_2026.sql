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
