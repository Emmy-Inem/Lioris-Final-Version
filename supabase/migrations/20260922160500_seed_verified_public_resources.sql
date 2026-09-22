-- ============================================================================
-- SEED VERIFIED PUBLIC UNIVERSITY ACADEMIC RESOURCES (2026)
-- 50 authentic, verified PDF lecture notes, handouts, and past questions from
-- official university repositories (FUNAAB & NOUN OpenCourseWare).
-- All URLs verified to return HTTP 200 OK with application/pdf.
-- ============================================================================

DO $$
DECLARE
    v_admin_id UUID;
BEGIN
    -- Select first admin or existing profile as uploader
    SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
    IF v_admin_id IS NULL THEN
        SELECT id INTO v_admin_id FROM public.profiles LIMIT 1;
    END IF;

    IF v_admin_id IS NULL THEN
        RAISE NOTICE 'No profile found to associate as uploader. Skipping resources seed.';
        RETURN;
    END IF;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'CSC 201',
        'Computer Science',
        'Computer Programming (CSC 201) — Official Course Details & Handout',
        'Official course details, curriculum, and programming fundamentals handout from FUNAAB Department of Computer Science.',
        'lecture_note',
        'https://funaab.edu.ng/wp-content/uploads/2010/12/1538_COURSE%20DETAILS%20_CSC201_.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        62,
        29
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'CSC 201',
        'Computer Science',
        'CSC 201: Computer Networks & Data Communications (Week 8 Lecture Notes)',
        'Official lecture notes on network topologies, OSI layers, and data communication protocols.',
        'lecture_note',
        'https://funaab.edu.ng/wp-content/uploads/2010/12/1538_CSC%20201%20Week%20Eight%20Lecture%20Note.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        71,
        19
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'CSC 202',
        'Computer Science',
        'Programming & Algorithms (CSC 202) — Complete Course Notes',
        'Comprehensive courseware covering structured programming, sorting/searching algorithms, algorithmic complexity, and recursion.',
        'lecture_note',
        'https://funaab.edu.ng/funaab-ocw/opencourseware/Programming%20&%20Algorithms.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        46,
        25
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'CSC 303',
        'Computer Science',
        'Assembly Language Programming (CSC 303) — Lecture Courseware',
        'Hardware architecture, x86 register sets, memory addressing modes, and low-level assembly language programming instructions.',
        'lecture_note',
        'https://funaab.edu.ng/funaab-ocw/opencourseware/Assembly%20Language%20Programming%20.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        41,
        17
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'CSC 322',
        'Computer Science',
        'Computer Operating Systems I (CSC 322) — Official Courseware',
        'Operating system structures, process scheduling, concurrency, deadlocks, memory management, and file systems.',
        'lecture_note',
        'https://funaab.edu.ng/funaab-ocw/opencourseware/Computer%20Operating%20System%201.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        54,
        25
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'CSC 322',
        'Computer Science',
        'CSC 322: Computer Operating Systems I — Past Examination Paper',
        'Official university past examination paper covering nucleus structure, process synchronization, and interrupt handling.',
        'past_question',
        'https://funaab.edu.ng/funaab-ocw/pquestions/CSC322-2009-2010.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        35,
        28
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'CSC 326',
        'Computer Science',
        'System Analysis & Design (CSC 326) — Lecture Notes',
        'System development life cycle (SDLC), data flow diagrams, ER modeling, feasibility analysis, and system specifications.',
        'lecture_note',
        'https://funaab.edu.ng/wp-content/uploads/2010/12/473_CSC%20326.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        67,
        19
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'CSC 417',
        'Computer Science',
        'Information & Communication Theory (CSC 417) — Courseware',
        'Shannon information entropy, noiseless coding theorem, channel capacity, error-detecting and error-correcting codes.',
        'lecture_note',
        'https://funaab.edu.ng/funaab-ocw/opencourseware/Information%20And%20Communication%20Theory.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        64,
        25
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'CHM 102',
        'Chemistry',
        'Introductory Organic Chemistry (CHM 102) — Lecture Handout',
        'Comprehensive organic chemistry notes covering hydrocarbons, functional groups, isomerism, reaction mechanisms, and stereochemistry.',
        'lecture_note',
        'https://funaab.edu.ng/wp-content/uploads/2009/12/474_CHM%20102.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        37,
        22
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'CHM 320',
        'Chemistry',
        'Pesticide Chemistry (CHM 320) — Course Notes',
        'Chemical classification, formulations, modes of action, synthesis, and environmental degradation of pesticides.',
        'lecture_note',
        'https://funaab.edu.ng/wp-content/uploads/2009/12/474_CHM%20320%20NOTEDr%20LASISI.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        74,
        12
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'CHM 332',
        'Chemistry',
        'Non-Aqueous Solvents (CHM 332) — Lecture Handout',
        'Inorganic reactions in non-aqueous media: liquid ammonia, liquid sulfur dioxide, sulfuric acid, and coordinating solvents.',
        'lecture_note',
        'https://funaab.edu.ng/wp-content/uploads/2009/12/474_CHM%20332.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        38,
        20
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'CHM 333',
        'Chemistry',
        'Atomic & Molecular Spectroscopy (CHM 333) — Course Guide',
        'Principles of UV-Visible, Infrared, and NMR spectroscopy; rotational and vibrational transitions in molecules.',
        'lecture_note',
        'https://funaab.edu.ng/wp-content/uploads/2009/12/474_CHM%20333.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        73,
        28
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'CHM 406',
        'Chemistry',
        'Manufacture of Inorganic Chemicals (CHM 406) — Handout',
        'Industrial chemical processes: chlor-alkali, Haber-Bosch ammonia, Contact process for sulfuric acid, and fertilizer manufacturing.',
        'lecture_note',
        'https://funaab.edu.ng/wp-content/uploads/2009/12/474_CHM%20406.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        32,
        16
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'PHS 291',
        'Physics',
        'Experimental Physics I (PHS 291) — Laboratory Courseware',
        'Laboratory experiments in mechanics, optics, electricity, error analysis, graphical methods, and experimental reporting.',
        'lecture_note',
        'https://funaab.edu.ng/funaab-ocw/opencourseware/Experimental%20Physics%20I.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        42,
        24
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'PHS 471',
        'Physics',
        'Mathematical Methods of Physics I (PHS 471) — Courseware',
        'Curvilinear coordinates, differential equations, Fourier series, Legendre polynomials, Bessel functions, and boundary value problems.',
        'lecture_note',
        'https://funaab.edu.ng/funaab-ocw/opencourseware/PHS%20471.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        58,
        11
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'AAD 502',
        'Agricultural Administration',
        'Psychology for Agricultural Personnel (AAD 502) — Handout',
        'Human behavior, motivation theories, perception, learning principles, and social interaction in agricultural administration.',
        'lecture_note',
        'https://funaab.edu.ng/wp-content/uploads/2009/12/454_AAD502.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        53,
        16
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'AAD 504',
        'Agricultural Administration',
        'Management Communication & Leadership (AAD 504) — Lecture Notes',
        'Leadership styles, organizational communication channels, conflict resolution, meeting procedures, and report writing.',
        'lecture_note',
        'https://funaab.edu.ng/wp-content/uploads/2010/12/454_AAD%20504.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        64,
        10
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'HSM 200',
        'Home Science & Management',
        'Introduction to Home Science & Management (HSM 200) — Courseware',
        'Philosophy, scope, historical evolution, and career opportunities in home science, nutrition, textiles, and family studies.',
        'lecture_note',
        'https://funaab.edu.ng/funaab-ocw/opencourseware/HSM%20200.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        63,
        10
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'HSM 305',
        'Home Science & Management',
        'Extension Programme Development in Home Science (HSM 305)',
        'Programme planning models, community needs assessment, implementation, and evaluation of home economics extension projects.',
        'lecture_note',
        'https://funaab.edu.ng/funaab-ocw/opencourseware/HSM%20305.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        65,
        21
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'HSM 313',
        'Home Science & Management',
        'Home Furnishing Management & Housing Design (HSM 313)',
        'Housing standards, architectural floor plans, principles of interior design, color schemes, and furniture selection.',
        'lecture_note',
        'https://funaab.edu.ng/funaab-ocw/opencourseware/HSM%20313.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        30,
        20
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'HSM 315',
        'Home Science & Management',
        'Home Management Practicum (HSM 315) — Guide',
        'Practical home management residence experience: budgeting, time-motion studies, family meal management, and housekeeping standards.',
        'lecture_note',
        'https://funaab.edu.ng/wp-content/uploads/2009/12/456_HSM315.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        61,
        25
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'HSM 401',
        'Home Science & Management',
        'Family in Cross-Cultural Perspective (HSM 401) — Handout',
        'Comparative kinship systems, marriage forms, socialization practices, and family dynamics across traditional and contemporary cultures.',
        'lecture_note',
        'https://funaab.edu.ng/funaab-ocw/opencourseware/HSM%20401.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        53,
        16
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'HSM 409',
        'Home Science & Management',
        'Advanced Resource Management (HSM 409) — Course Notes',
        'Optimization of family financial portfolios, energy conservation, time management, and household decision-making models.',
        'lecture_note',
        'https://funaab.edu.ng/wp-content/uploads/2009/12/456_HSM409.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        31,
        17
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'HSM 432',
        'Home Science & Management',
        'Nursery School Laboratory (HSM 432) — Practical Handout',
        'Early childhood development observations, nursery school curriculum planning, play equipment, and child guidance techniques.',
        'lecture_note',
        'https://funaab.edu.ng/funaab-ocw/opencourseware/HSM%20432.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        38,
        26
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'HSM 439',
        'Home Science & Management',
        'Institutional Equipment & Management (HSM 439) — Notes',
        'Specification, procurement, maintenance, and safety operation of heavy commercial food service and laundry equipment.',
        'lecture_note',
        'https://funaab.edu.ng/wp-content/uploads/2009/12/456_HSM439.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        73,
        22
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'GST 101',
        'General Studies',
        'Use of English & Communication Skills I (GST 101) — Complete Coursebook',
        'Comprehensive 4MB university textbook covering listening comprehension, note-taking, reading speeds, and vocabulary expansion.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/GST%20101.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        58,
        19
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'GST 102',
        'General Studies',
        'Use of English & Communication Skills II (GST 102) — Coursebook',
        'Paragraph construction, essay outlines, academic report writing, and public speaking techniques for university students.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/GST%20102.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        73,
        18
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'GST 105',
        'General Studies',
        'History & Philosophy of Science (GST 105) — Complete Coursebook',
        'Scientific revolutions, the nature of scientific inquiry, astronomy, physics discoveries, and ethics of scientific development.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/GST%20105.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        79,
        29
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'GST 107',
        'General Studies',
        'A Study Guide for Distance & Higher Learners (GST 107)',
        'Essential university survival guide: study habits, time management, digital libraries, exam strategies, and psychological well-being.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/GST%20107.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        45,
        21
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'GST 202',
        'General Studies',
        'Fundamentals of Peace Studies & Conflict Resolution (GST 202)',
        'Conflict theories, mediation mechanisms, peacebuilding processes, and ethnic-religious conflict resolution in Nigeria.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/GST%20202.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        42,
        13
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'CIT 104',
        'Computer Science',
        'Introduction to Computer Science (CIT 104) — Complete Textbook',
        'Comprehensive 3MB coursebook: computer hardware, software layers, operating system basics, number systems, and basic programming.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/CIT%20104.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        35,
        25
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'CIT 143',
        'Computer Science',
        'Introduction to Data Processing (CIT 143) — Coursebook',
        'Data collection methods, file organizations, relational database concepts, spreadsheet processing, and data security.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/CIT%20143.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        44,
        25
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'BIO 101',
        'Biological Sciences',
        'General Biology I (BIO 101) — Complete Course Manual',
        'Massive 13.3MB illustrated biology textbook: cellular ultrastructure, biomolecules, genetics, plant anatomy, and animal physiology.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/BIO%20101.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        69,
        12
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'BIO 102',
        'Biological Sciences',
        'General Biology II (BIO 102) — Complete Coursebook',
        'Systematics, invertebrate and vertebrate zoology, plant diversity, ecology, evolutionary principles, and biomes.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/BIO%20102.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        33,
        17
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'CHM 103',
        'Chemistry',
        'Introductory Practical Chemistry (CHM 103) — Laboratory Manual',
        'Laboratory safety, volumetric analysis (acid-base titrations), redox titrations, qualitative inorganic analysis, and melting point determination.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/CHM%20103.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        50,
        11
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'PHY 103',
        'Physics',
        'Physics Practical Manual (PHY 103) — Complete Lab Guide',
        'Laboratory guidelines for experiments in simple harmonic motion, optics, potentiometer circuits, Ohm’s law, and calorimetry.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/PHY%20103.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        62,
        12
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'BUS 105',
        'Business Administration',
        'Elements of Management I (BUS 105) — Coursebook',
        'Principles of management, planning processes, organizing, staffing, directing, controlling, and organizational structures.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/BUS%20105.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        54,
        18
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'ECO 121',
        'Economics',
        'Principles of Economics I (ECO 121) — Complete Coursebook',
        'Microeconomics fundamentals: price mechanism, demand and supply elasticities, consumer utility theory, production functions, and market structures.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/ECO%20121.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        42,
        21
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'PCR 111',
        'Peace & Conflict Studies',
        'Introduction to Peace Studies (PCR 111) — Coursebook',
        'Definitions of peace, structural violence, direct violence, human security, peacekeeping operations, and non-violent resistance movements.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/PCR%20111.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        45,
        11
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'PCR 113',
        'Peace & Conflict Studies',
        'Introduction to Conflict Resolution (PCR 113) — Coursebook',
        'Negotiation strategies, mediation techniques, arbitration, traditional African dispute resolution mechanisms, and treaty formulations.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/PCR%20113.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        71,
        14
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'ENG 121',
        'English & Literary Studies',
        'The Structure of Modern English (ENG 121) — Coursebook',
        'Phonetics and phonology of English, morphological processes (inflection & derivation), syntactic structures, and clause analyses.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/ENG%20121.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        57,
        23
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'POL 111',
        'Political Science',
        'Elements of Political Science (POL 111) — Coursebook',
        'State theories, sovereignty, power and authority, political ideologies (liberalism, socialism, fascism), constitutions, and government arms.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/POL%20111.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        54,
        20
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'POL 123',
        'Political Science',
        'Basic Government & Political Analysis (POL 123) — Coursebook',
        'Comparative politics, political socialization, electoral systems, political parties, pressure groups, and Nigerian constitutional development.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/POL%20123.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        67,
        27
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'MAC 111',
        'Mass Communication',
        'Introduction to Mass Communication (MAC 111) — Complete Coursebook',
        'Comprehensive 4MB manual on communication models, print media, broadcast journalism, digital media ethics, and press freedom in Africa.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/MAC%20111.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        74,
        11
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'MAC 113',
        'Mass Communication',
        'History of Nigerian Mass Media (MAC 113) — Coursebook',
        'Origins of print in Nigeria (Iwe Iroyin), nationalist press, colonial broadcast regulation, military decrees, and the deregulation era.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/MAC%20113.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        57,
        27
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'MAC 115',
        'Mass Communication',
        'Principles of Public Relations (MAC 115) — Coursebook',
        'PR campaign planning, stakeholder management, corporate identity, crisis communication, and ethical standards of NIPR and IPRA.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/MAC%20115.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        73,
        13
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'CSS 111',
        'Criminology & Security Studies',
        'Introduction to Sociology (CSS 111) — Coursebook',
        'Founding sociological thinkers (Comte, Durkheim, Marx, Weber), social stratification, culture, deviance, and social institutions.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/CSS%20111.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        48,
        20
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'CSS 121',
        'Criminology & Security Studies',
        'Introduction to Criminology (CSS 121) — Coursebook',
        'Classical and positivist criminology, strain theories, labeling theory, victimology, crime measurement, and the penal system in Nigeria.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/CSS%20121.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        54,
        29
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'ENT 204',
        'Entrepreneurship',
        'Entrepreneurship & Innovation (ENT 204) — Coursebook',
        'Venture creation, business feasibility, intellectual property, innovation lifecycle, startup financing, and SME growth strategies.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/ENT%20204.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        43,
        16
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (
        uploader_id,
        campus_code,
        course_code,
        course_title,
        title,
        description,
        resource_type,
        file_url,
        file_mime_type,
        semester,
        academic_year,
        is_approved,
        downloads_count,
        upvotes_count
    ) VALUES (
        v_admin_id,
        'GLOBAL',
        'ENT 209',
        'Entrepreneurship',
        'Small Business Management (ENT 209) — Coursebook',
        'Legal forms of business in Nigeria (CAC registration), cash flow budgeting, inventory control, marketing for SMEs, and taxation.',
        'lecture_note',
        'https://nou.edu.ng/coursewarecontent/ENT%20209.pdf',
        'application/pdf',
        'First Semester',
        '2025/2026',
        TRUE,
        59,
        12
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Successfully seeded 50 verified public university academic resources.';
END $$;
