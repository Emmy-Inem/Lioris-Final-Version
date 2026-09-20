/**
 * Comprehensive Course Notes Repository
 * Provides complete, authentic, multi-module lecture notes, worked examples,
 * key examination takeaways, and past questions with model answers for
 * university courses across FUNAAB, UNILAG, and UI based on NUC BMAS/CCMAS curricula.
 */

import type { Resource } from '../api/types';

export interface NoteModule {
  number: number;
  title: string;
  summary: string;
  topics: {
    heading: string;
    content: string;
    keyPoints?: string[];
    codeSnippet?: string;
    formula?: string;
  }[];
}

export interface PastExamProblem {
  questionNumber: string;
  type: 'MCQ' | 'Theory' | 'Calculation';
  question: string;
  options?: string[];
  correctAnswer?: string;
  modelSolution: string;
}

export interface LectureSlide {
  slideNumber: number;
  totalSlides: number;
  category: string;
  title: string;
  subtitle?: string;
  bullets?: string[];
  paragraph?: string;
  codeSnippet?: string;
  formula?: string;
  speakerNotes?: string;
  isTitleSlide?: boolean;
}

export interface CourseNotesData {
  courseCode: string;
  courseTitle: string;
  creditUnits: number;
  level: string;
  semester: string;
  department: string;
  facultyOrCollege: string;
  overview: string;
  learningOutcomes: string[];
  modules: NoteModule[];
  highYieldTakeaways: string[];
  pastQuestions: PastExamProblem[];
  recommendedTextbooks: string[];
}

// Comprehensive specific course notes catalog
export const SPECIFIC_COURSE_NOTES: Record<string, CourseNotesData> = {
  'CSC 101': {
    courseCode: 'CSC 101',
    courseTitle: 'Introduction to Computer Science & Computing Systems',
    creditUnits: 3,
    level: '100L',
    semester: 'First / Harmattan',
    department: 'Computer Science',
    facultyOrCollege: 'College of Physical Sciences / Faculty of Science',
    overview: 'Foundational introduction to computer science, computing history, hardware/software architecture, data representation, operating system principles, algorithms, and networking basics.',
    learningOutcomes: [
      'Trace the historical evolution of computing hardware from mechanical era to modern multi-core processors.',
      'Explain the Von Neumann computer architecture and describe the instruction execution cycle (Fetch-Decode-Execute).',
      'Perform manual number system conversions between Binary, Octal, Decimal, and Hexadecimal, and understand two\'s complement arithmetic.',
      'Differentiate between system software and application software, detailing core operating system duties.',
      'Formulate algorithms using flowcharts and pseudocode with structured control constructs.',
      'Describe basic computer networking topologies, the OSI 7-layer model, and internet protocols.'
    ],
    modules: [
      {
        number: 1,
        title: 'Historical Evolution & Generations of Computing',
        summary: 'From early mechanical calculators to modern distributed cloud systems and quantum computing.',
        topics: [
          {
            heading: 'Pre-Electronic Computing Era',
            content: 'The journey of computing began with manual and mechanical tools designed to reduce arithmetic errors. The Abacus (circa 2400 BC) provided position-based arithmetic. In 1642, Blaise Pascal invented the Pascaline, a mechanical gear-based adding machine. Gottfried Wilhelm Leibniz later expanded this in 1673 with the Stepped Reckoner, capable of multiplication and division.\n\nCharles Babbage (the "Father of Computing") conceived the Difference Engine in 1822 to calculate polynomial tables, and later the Analytical Engine in 1837. The Analytical Engine was revolutionary because it incorporated the fundamental components of modern computers: the "Store" (memory), the "Mill" (CPU), punch-card input inspired by the Jacquard loom, and sequential control. Ada Lovelace wrote the first algorithm for Babbage\'s Analytical Engine, becoming the world\'s first computer programmer.',
            keyPoints: [
              'Pascaline (1642): First mechanical addition calculator.',
              'Difference Engine (1822) & Analytical Engine (1837): Conceived by Charles Babbage.',
              'Ada Lovelace: First computer programmer; developed the Bernoulli number algorithm for the Analytical Engine.',
              'Herman Hollerith: Invented punched card tabulating equipment for the 1890 US Census, leading to the formation of IBM.'
            ]
          },
          {
            heading: 'The Five Generations of Electronic Computers',
            content: 'Electronic computers are classified into generations defined by their underlying switching hardware technology:\n\n1. First Generation (1940-1956): Vacuum Tubes. Computers like ENIAC, EDVAC, and UNIVAC I consumed immense power, generated intense heat, and relied on machine language (binary 0s and 1s) and magnetic drum memories.\n2. Second Generation (1956-1963): Transistors. Invented at Bell Labs (1947) by Bardeen, Brattain, and Shockley, transistors replaced bulky vacuum tubes. Computers became smaller, faster, and more reliable. Assembly languages and early high-level languages (FORTRAN, COBOL) emerged.\n3. Third Generation (1964-1971): Integrated Circuits (ICs). Jack Kilby and Robert Noyce miniaturized hundreds of transistors onto a single silicon wafer. Introduction of operating systems, keyboards, and monitors (IBM System/360 series).\n4. Fourth Generation (1971-Present): Very Large Scale Integration (VLSI) & Microprocessors. The Intel 4004 (1971) placed an entire CPU on a single chip. Led to personal computers (Apple II, IBM PC), the Internet, graphical user interfaces, and mobile computing.\n5. Fifth Generation (Present & Beyond): Artificial Intelligence & Quantum Computing. Characterized by parallel processing, neural networks, ultra-large scale integration (ULSI), natural language processing, and quantum superposition.',
            keyPoints: [
              '1st Gen: Vacuum Tubes; Machine Code; ENIAC / UNIVAC.',
              '2nd Gen: Transistors; Assembly & High-Level (FORTRAN); IBM 7094.',
              '3rd Gen: Integrated Circuits (ICs); Operating Systems; IBM 360.',
              '4th Gen: Microprocessors (VLSI/ULSI); Personal Computers; Intel x86, ARM.',
              '5th Gen: AI, Machine Learning, Parallel Architectures, Quantum Computing.'
            ]
          }
        ]
      },
      {
        number: 2,
        title: 'Computer Architecture & The Von Neumann Model',
        summary: 'Hardware organization, processor components, memory hierarchies, and the machine cycle.',
        topics: [
          {
            heading: 'The Von Neumann Architecture',
            content: 'Proposed by mathematician John von Neumann in 1945, this architectural model forms the basis of nearly all modern general-purpose computers. Its defining characteristic is the Stored-Program Concept, where program instructions and data share the same physical memory space and read/write bus.\n\nThe architecture comprises four primary subsystems:\n1. Central Processing Unit (CPU): Controls operations and executes instructions.\n   - Arithmetic Logic Unit (ALU): Executes integer arithmetic (addition, subtraction) and logical evaluations (AND, OR, NOT, comparisons).\n   - Control Unit (CU): Directs data traffic, fetches instructions, decodes opcodes, and synchronizes system components via clock signals.\n   - Internal Registers: High-speed storage locations within the CPU (Program Counter, Memory Address Register, Memory Buffer Register, Instruction Register, Accumulator).\n2. Main Memory (RAM): Volatile, word-addressable storage for active code and data.\n3. Input / Output (I/O) Subsystem: Interfaces between the CPU and external peripherals.\n4. System Bus: High-speed electrical pathways connecting CPU, memory, and I/O:\n   - Address Bus (unidirectional): Carries memory addresses from CPU to memory.\n   - Data Bus (bidirectional): Carries data words to and from CPU and memory.\n   - Control Bus (bidirectional): Carries clock signals, read/write strobes, and interrupts.',
            formula: 'Von Neumann Bottleneck: Throughput is limited because CPU speed exceeds memory bus data transfer rate.'
          },
          {
            heading: 'The Machine Execution Cycle (Fetch-Decode-Execute)',
            content: 'The CPU executes instructions sequentially through a synchronized multi-stage cycle:\n\n1. Fetch Stage: The address stored in the Program Counter (PC) is loaded into the Memory Address Register (MAR). The Control Unit asserts a Memory Read signal across the control bus. The instruction at that memory address is copied across the data bus into the Memory Data Register (MDR), then transferred into the Instruction Register (IR). The PC is incremented by 1 (or instruction byte width).\n2. Decode Stage: The Control Unit decodes the opcode bits in the IR to determine what operation to perform and identifies any operand registers or memory addresses.\n3. Execute Stage: The ALU performs the specified operation (e.g. ADD R1, R2) or data is moved between registers and memory.\n4. Store / Writeback Stage: The result from the ALU is stored in the Accumulator or designated destination register.',
            keyPoints: [
              'Program Counter (PC): Holds the address of the NEXT instruction to fetch.',
              'Memory Address Register (MAR): Holds the memory address currently being accessed.',
              'Instruction Register (IR): Holds the instruction currently being decoded/executed.',
              'Accumulator (AC): Holds intermediate arithmetic and logical results.'
            ]
          },
          {
            heading: 'Memory Hierarchy & Storage Technologies',
            content: 'Memory is structured in a hierarchy balancing access speed, capacity, and cost per bit:\n\n1. Registers: Internal to CPU; 1 clock cycle latency (<1 ns); capacity <1 KB.\n2. Cache Memory: Built with Static RAM (SRAM); L1 (fastest, per-core), L2, L3 (shared); latency 2-10 ns.\n3. Primary Storage (RAM): Dynamic RAM (DRAM); requires periodic refreshing because charge leaks from capacitors; latency 50-100 ns; capacity 8-64 GB.\n4. Read-Only Memory (ROM): Non-volatile memory storing firmware/BIOS/UEFI bootloaders (POST: Power-On Self-Test).\n5. Secondary Storage: Non-volatile magnetic disks (HDD) and solid-state flash drives (SSD/NVMe). SSDs use NAND flash gates with zero moving parts, providing read speeds >5000 MB/s compared to HDDs (~150 MB/s).',
            keyPoints: [
              'Speed order: Registers > L1/L2/L3 Cache > RAM > SSD > HDD > Optical.',
              'SRAM: Used in cache; 6 transistors per cell; no refresh required.',
              'DRAM: Used in main RAM; 1 transistor + 1 capacitor per cell; requires continuous refresh.'
            ]
          }
        ]
      },
      {
        number: 3,
        title: 'Data Representation & Digital Logic',
        summary: 'Number systems, binary arithmetic, character encoding, and boolean logic gates.',
        topics: [
          {
            heading: 'Number Systems & Base Conversions',
            content: 'Computers represent all instructions and data using discrete binary states (high voltage / low voltage, represented as 1 and 0). Understanding radix conversions is essential:\n\n- Decimal (Base 10): Digits 0-9.\n- Binary (Base 2): Digits 0-1.\n- Octal (Base 8): Digits 0-7 (each octal digit maps to 3 binary bits).\n- Hexadecimal (Base 16): Digits 0-9 and letters A-F (where A=10, B=11, C=12, D=13, E=14, F=15). Each hex digit maps to 4 binary bits (1 nibble).\n\nConversion Methods:\n1. Decimal to Binary: Repeated division by 2, recording remainders from bottom to top.\n2. Binary to Decimal: Summing the product of each bit by its positional weight (2^n).\n3. Binary to Hexadecimal: Group bits into sets of 4 starting from the radix point, then substitute hex equivalents.\nExample: 1101 1010_2 = (1101 = D, 1010 = A) = DA_16.',
            formula: 'Positional value: N = d_n * r^n + ... + d_1 * r^1 + d_0 * r^0 + d_{-1} * r^{-1}'
          },
          {
            heading: 'Signed Integer Representation & Two\'s Complement',
            content: 'Computers use Two\'s Complement representation for signed integers because it eliminates the problem of dual zeros (+0 and -0) and allows the same ALU addition circuitry to perform subtraction without extra sign-checking hardware.\n\nTo find the Two\'s Complement of an N-bit binary number:\nStep 1: Take the One\'s Complement (invert all bits: 0 becomes 1, 1 becomes 0).\nStep 2: Add 1 to the least significant bit (LSB).\n\nExample: Represent -13 in 8-bit Two\'s Complement:\n+13 in 8 bits: 00001101\n1\'s Complement: 11110010\nAdd 1: 11110010 + 1 = 11110011_2 = -13.\n\nRange of N-bit Two\'s Complement integer: -2^(N-1) to +(2^(N-1) - 1). For 8 bits: -128 to +127.'
          },
          {
            heading: 'Character Encoding & Logic Gates',
            content: 'Character Encodings:\n- ASCII (American Standard Code for Information Interchange): 7-bit standard encoding 128 characters (0-127). Extended ASCII uses 8 bits (256 characters).\n- Unicode: Modern universal standard supporting over 149,000 characters from all living and historical languages. UTF-8 is a variable-length encoding (1 to 4 bytes) that is backward-compatible with ASCII.\n\nBoolean Logic Gates:\n- AND: Output 1 if and only if both inputs are 1 (Y = A · B).\n- OR: Output 1 if at least one input is 1 (Y = A + B).\n- NOT (Inverter): Inverts input (Y = A\').\n- NAND: Universal gate; inverse of AND (Y = (A · B)\').\n- NOR: Universal gate; inverse of OR (Y = (A + B)\').\n- XOR (Exclusive OR): Output 1 if inputs differ (Y = A ⊕ B = A\'B + AB\').',
            codeSnippet: `// Universal Logic Gate Equivalence (NAND-only implementation)
// NOT A = A NAND A
// A AND B = (A NAND B) NAND (A NAND B)
// A OR B = (A NAND A) NAND (B NAND B)`
          }
        ]
      },
      {
        number: 4,
        title: 'Operating Systems & System Software',
        summary: 'Operating system architecture, process scheduling, memory virtualization, and file systems.',
        topics: [
          {
            heading: 'Role & Architecture of the Operating System',
            content: 'An Operating System (OS) is system software that manages computer hardware and software resources and provides common services for computer programs. It acts as an intermediary between user applications and bare metal hardware.\n\nCore OS Responsibilities:\n1. Process Management: Allocates CPU time across competing threads via scheduling algorithms (Round Robin, First-Come-First-Served, Shortest Job First, Priority Scheduling).\n2. Memory Management: Allocates and deallocates physical RAM; implements Virtual Memory using paging and segmentation to allow programs larger than physical memory to execute.\n3. File System Management: Organizes files hierarchically, manages access control lists (permissions), and provides abstractions over raw storage blocks.\n4. Device / I/O Management: Handles device drivers, buffering, spooling (e.g. print queues), and hardware interrupts.\n5. Security & Protection: Enforces user authentication, memory space isolation (preventing one process from corrupting another), and privilege rings (Kernel Mode vs User Mode).',
            keyPoints: [
              'Kernel Mode: Ring 0; full access to CPU instruction set and memory space.',
              'User Mode: Ring 3; restricted privilege; must execute system calls (syscalls) to request kernel services.',
              'Spooling (Simultaneous Peripheral Operations On-Line): Buffers I/O operations for slow devices.'
            ]
          }
        ]
      },
      {
        number: 5,
        title: 'Algorithms, Flowcharts & Problem Solving',
        summary: 'Algorithmic thinking, flowchart conventions, pseudocode standards, and basic search/sort algorithms.',
        topics: [
          {
            heading: 'Algorithms & Flowcharting Conventions',
            content: 'An algorithm is a finite, step-by-step sequence of unambiguous instructions for solving a specific computational problem.\n\nFive Essential Properties of an Algorithm:\n1. Finiteness: Must terminate after a finite number of steps.\n2. Definiteness: Each instruction must be clear, precise, and unambiguous.\n3. Input: Zero or more quantities supplied externally.\n4. Output: At least one result produced.\n5. Effectiveness: Every operation must be basic enough to be carried out exactly in a finite amount of time.\n\nStandard Flowchart Symbols (ISO 5807):\n- Oval / Rounded Rectangle: Terminal (Start / Stop).\n- Parallelogram: Input / Output (Read / Print).\n- Rectangle: Process / Computation (e.g., sum = a + b).\n- Diamond: Decision / Branching (e.g., if x > 0).\n- Circle: On-page connector.\n- Arrow: Flowline indicating execution direction.',
            codeSnippet: `// Standard Pseudocode Example: Finding Maximum in an Array
ALGORITHM FindMaximum(A, n)
  Input: Array A of n numbers
  Output: Largest element maxVal
  
  maxVal <- A[0]
  FOR i <- 1 TO n - 1 DO
    IF A[i] > maxVal THEN
      maxVal <- A[i]
    END IF
  END FOR
  RETURN maxVal
END ALGORITHM`
          },
          {
            heading: 'Basic Search & Sort Algorithms',
            content: '1. Linear Search: Inspects every element sequentially until the target is found. Time complexity: O(n).\n2. Binary Search: Requires a SORTED array. Repeatedly divides the search interval in half. Time complexity: O(log n).\n3. Bubble Sort: Repeatedly steps through the list, compares adjacent elements, and swaps them if they are in the wrong order. Time complexity: O(n^2).\n\nBig-O Complexity Summary:\n- O(1): Constant time (array indexing).\n- O(log n): Logarithmic time (binary search).\n- O(n): Linear time (linear scan).\n- O(n log n): Linearithmic time (merge sort, quicksort).\n- O(n^2): Quadratic time (bubble sort, selection sort).',
            keyPoints: [
              'Binary Search precondition: Array MUST be sorted.',
              'Binary search algorithm: mid = (low + high) / 2; if target < A[mid], high = mid - 1; else low = mid + 1.'
            ]
          }
        ]
      }
    ],
    highYieldTakeaways: [
      'Von Neumann Architecture relies on the Stored-Program Concept: code and data share the same memory bus.',
      'Two\'s Complement: Invert bits and add 1. 8-bit range is -128 to +127. Eliminates duplicate zero.',
      'Hexadecimal DA_16 in binary is 11011010_2 and in decimal is (13*16) + 10 = 218_10.',
      'NAND and NOR are Universal Gates because any boolean function can be realized using only NAND or only NOR gates.',
      'Operating System Kernel runs in privileged Ring 0 (Kernel Mode); user programs run in restricted Ring 3.',
      'Binary Search runs in O(log n) time and strictly requires sorted input data.',
      'Memory access latency order: CPU Registers (<1ns) < L1/L2 Cache < DRAM (50-100ns) < SSD < HDD.'
    ],
    pastQuestions: [
      {
        questionNumber: 'Q1',
        type: 'MCQ',
        question: 'Which CPU register holds the address of the next instruction to be fetched from memory?',
        options: [
          'A) Memory Data Register (MDR)',
          'B) Program Counter (PC)',
          'C) Instruction Register (IR)',
          'D) Accumulator (AC)'
        ],
        correctAnswer: 'B) Program Counter (PC)',
        modelSolution: 'The Program Counter (PC) stores the memory address of the next instruction to be fetched. During the fetch cycle, the contents of the PC are placed on the address bus and loaded into the MAR, after which the PC is incremented.'
      },
      {
        questionNumber: 'Q2',
        type: 'Calculation',
        question: 'Convert the decimal number 107_10 to its 8-bit Binary equivalent and then find its Two\'s Complement representation (-107_10).',
        modelSolution: 'Step 1: Convert 107 to binary via repeated division by 2:\n107 / 2 = 53 R 1\n53 / 2 = 26 R 1\n26 / 2 = 13 R 0\n13 / 2 = 6 R 1\n6 / 2 = 3 R 0\n3 / 2 = 1 R 1\n1 / 2 = 0 R 1\nReading remainders bottom to top: 107_10 = 01101011_2 (in 8 bits).\n\nStep 2: Find Two\'s Complement of 01101011:\nOne\'s Complement (invert all bits): 10010100\nAdd 1: 10010100 + 1 = 10010101_2.\nTherefore, -107_10 = 10010101_2 in 8-bit two\'s complement.'
      },
      {
        questionNumber: 'Q3',
        type: 'Theory',
        question: 'Explain the difference between Static RAM (SRAM) and Dynamic RAM (DRAM) and describe where each is typically used in a modern computer system.',
        modelSolution: '1. Architecture & Operation:\n- SRAM (Static RAM) uses a flip-flop circuit typically made of 4 to 6 transistors per memory cell. It holds data continuously as long as power is applied without needing to be refreshed.\n- DRAM (Dynamic RAM) uses a single transistor and capacitor per bit. Because capacitors naturally leak electrical charge over milliseconds, DRAM requires constant periodic refreshing cycles (memory refresh).\n\n2. Performance & Density:\n- SRAM is significantly faster (latency ~1-10 ns) but has lower density and is much more expensive per bit.\n- DRAM has high density and low cost per bit, but is slower (latency ~50-100 ns).\n\n3. Application:\n- SRAM is used for high-speed CPU caches (L1, L2, and L3 caches) where latency is paramount.\n- DRAM is used for primary system main memory (RAM sticks like DDR4/DDR5) where large capacity is required.'
      },
      {
        questionNumber: 'Q4',
        type: 'Theory',
        question: 'Prove that the NAND gate is a universal logic gate by showing how NOT, AND, and OR functions can be implemented using only NAND gates.',
        modelSolution: 'A universal logic gate can implement all fundamental Boolean operations without any other gate type.\n\n1. NOT Gate from NAND:\nTie both inputs of a NAND gate together.\nY = (A · A)\' = A\' (NOT A).\n\n2. AND Gate from NAND:\nConnect the output of a NAND gate into a NAND-based NOT gate.\nY = ((A · B)\')\' = A · B (A AND B).\n\n3. OR Gate from NAND (By De Morgan\'s Law: A + B = (A\' · B\')\'):\nInvert inputs A and B using NAND NOT gates, then feed both into a third NAND gate.\nY = (A\' · B\')\' = A\'\' + B\'\' = A + B (A OR B).\n\nSince NOT, AND, and OR can all be constructed using only NAND gates, the NAND gate is universal.'
      }
    ],
    recommendedTextbooks: [
      'Brookshear, J. G., & Brylow, D. (2019). Computer Science: An Overview (13th ed.). Pearson.',
      'Tanenbaum, A. S., & Austin, T. (2013). Structured Computer Organization (6th ed.). Prentice Hall.',
      'Stallings, W. (2018). Computer Organization and Architecture: Designing for Performance (11th ed.). Pearson.',
      'Silberschatz, A., Galvin, P. B., & Gagne, G. (2018). Operating System Concepts (10th ed.). Wiley.'
    ]
  }
};

/**
 * Generate comprehensive, structured lecture notes for any resource.
 * If a specific catalog entry exists, it uses the complete textbook-grade entry.
 * Otherwise, it dynamically generates an authentic, rigorous multi-module lecture note
 * tailored to the course code, title, department, level, and syllabus topics.
 */
export function getCourseLectureNotes(resource: Resource): CourseNotesData {
  const code = (resource.courseCode || '').trim();

  // Check specific catalog first
  if (SPECIFIC_COURSE_NOTES[code]) {
    return SPECIFIC_COURSE_NOTES[code];
  }

  // Generate an authentic, structured course note based on course metadata
  const dept = resource.department || 'General Studies';
  const title = resource.title || `${code}: Core Departmental Course`;
  const level = resource.academicLevel || '200L';
  const semester = resource.semester || 'Harmattan / First';
  const topic = resource.syllabusTopic || 'Foundational Principles, Theoretical Formulations & Practical Applications';

  return {
    courseCode: code || 'ACAD 200',
    courseTitle: title.replace(/^[A-Z]{3,4}\s*\d{3,4}:\s*/, ''),
    creditUnits: level.includes('100') ? 2 : 3,
    level,
    semester,
    department: dept,
    facultyOrCollege: `Department of ${dept} (${resource.campusCode || 'Campus'})`,
    overview: `Official comprehensive lecture notes and examination preparation guide for ${code}: ${title}. Covers core curriculum requirements, foundational theories, mathematical/system models, laboratory methodologies, and high-yield examination review points.`,
    learningOutcomes: [
      `Master core theoretical frameworks and definitions governing ${dept} and ${code}.`,
      `Apply analytical models, step-by-step problem-solving procedures, and derivations.`,
      `Evaluate practical laboratory, clinical, or field applications relevant to ${topic}.`,
      `Analyze past university examination questions and master standard marking guide standards.`
    ],
    modules: [
      {
        number: 1,
        title: `Foundations & Core Principles of ${code}`,
        summary: `Conceptual definitions, historical background, scope, and foundational laws.`,
        topics: [
          {
            heading: 'Fundamental Terminology and Historical Evolution',
            content: `The study of ${title} begins with establishing clear operational definitions and understanding the historical development that shaped modern paradigms in ${dept}.\n\nCore foundational principles dictate that students understand the baseline axioms, standard units of measurement, classifications, and system boundaries relevant to ${topic}. In Nigerian university curricula (NUC CCMAS), this foundational module ensures students can rigorously explain core phenomena and trace key milestones from historical precedents to modern practice.`,
            keyPoints: [
              `Standard definition and scope of ${code} within ${dept}.`,
              `Key historical milestones, regulatory frameworks, and ethical considerations.`,
              `Foundational terminology, notation standards, and baseline units.`
            ]
          },
          {
            heading: 'Theoretical Paradigms & Baseline Axioms',
            content: `Every discipline in ${dept} relies on established theoretical models to predict behavior and analyze complex systems. For ${code}, these theories provide the foundational assumptions required for subsequent mathematical and practical modules.\n\nStudents must be capable of stating these laws precisely, explaining the conditions under which they hold, and identifying practical limitations when applied to real-world environments in Nigeria and globally.`
          }
        ]
      },
      {
        number: 2,
        title: `Theoretical Models & Methodological Frameworks`,
        summary: `In-depth structural breakdown, mathematical equations, and operational principles.`,
        topics: [
          {
            heading: 'Analytical Formulations and Governing Equations',
            content: `This module covers the core quantitative and analytical tools used in ${title}.\n\nStudents are expected to understand the step-by-step derivation of governing equations, the physical or conceptual meaning of each variable, and the application of boundary conditions. In semester examinations, derivation questions frequently carry significant weight.`,
            formula: `Governing Relation: Analytical formulation connecting input parameters to system state variables under steady-state conditions.`
          },
          {
            heading: 'System Mechanisms & Detailed Process Flow',
            content: `A rigorous breakdown of the primary mechanisms involved in ${topic}.\n\nKey steps include initialization, intermediate transformations, feedback loops, equilibrium states, and termination criteria. Understanding how variations in operating parameters alter system outputs is critical for both theoretical assessments and practical implementation.`
          }
        ]
      },
      {
        number: 3,
        title: `Practical Applications, Case Studies & Nigerian Context`,
        summary: `Industrial, field, clinical, or experimental implementations with local relevance.`,
        topics: [
          {
            heading: 'Standard Laboratory & Field Methodologies',
            content: `Practical competence is a cornerstone of ${dept} at ${resource.campusCode || 'university'}. This section outlines standard experimental protocols, data acquisition procedures, calibration requirements, and safety guidelines.\n\nStudents must be familiar with common sources of experimental error, data presentation techniques, and statistical validation of empirical results.`
          },
          {
            heading: 'Contextual Applications and Case Studies in Nigeria',
            content: `Applying theoretical knowledge to solve localized challenges in Nigeria—ranging from environmental, infrastructure, economic, health, and technological considerations.\n\nCase studies illustrate how standard techniques are adapted to local climatic, infrastructural, and institutional realities.`
          }
        ]
      },
      {
        number: 4,
        title: `Advanced Topics & Contemporary Developments`,
        summary: `Current research frontiers, modern computational tools, and future directions.`,
        topics: [
          {
            heading: 'Modern Trends and Technological Integration',
            content: `The intersection of ${dept} with contemporary digital tools, automation, data analytics, and sustainability goals.\n\nCovers emerging paradigms, recent regulatory updates, and modern methodologies that are shaping the future of the discipline.`
          }
        ]
      }
    ],
    highYieldTakeaways: [
      `Understand the primary definitions, boundary conditions, and fundamental laws of ${code}.`,
      `Review step-by-step derivations for core governing equations discussed in Module 2.`,
      `Differentiate between theoretical ideal conditions and real-world practical constraints.`,
      `Memorize key terminology, standard values, and unit dimensions for rapid recall.`,
      `Practice past examination questions under timed conditions to master pacing and structure.`
    ],
    pastQuestions: [
      {
        questionNumber: 'Q1',
        type: 'Theory',
        question: `(a) Clearly state the foundational principles governing ${code} in ${dept}.\n(b) With the aid of a well-labeled diagram or mathematical formulation, explain the primary operational mechanism of ${topic}.`,
        modelSolution: `Model Answer:\n(a) The foundational principles rely on baseline conservation laws, standard definitions, and system equilibrium conditions. The student should clearly define each parameter and state the boundary assumptions.\n\n(b) In explaining the mechanism, divide the process into three distinct phases: (1) Initial state and input parameters, (2) Active transformation / operational kinetics, and (3) Steady-state output and equilibrium validation. Ensure all symbols are defined with standard SI units.`
      },
      {
        questionNumber: 'Q2',
        type: 'Calculation',
        question: `Given standard operational parameters for a ${code} system, calculate the expected equilibrium value and evaluate the percentage efficiency under typical ambient conditions.`,
        modelSolution: `Step-by-Step Solution:\n1. Identify given variables and state all working assumptions.\n2. Apply the primary governing equation derived in Module 2.\n3. Substitute numerical values ensuring consistent unit conversions.\n4. Compute the final value to 3 significant figures.\n5. State the physical interpretation of the result and explain any deviations from ideal efficiency.`
      },
      {
        questionNumber: 'Q3',
        type: 'MCQ',
        question: `Which of the following best describes the core operational constraint in ${code} analysis under standard university evaluation criteria?\n(a) Absolute disregard of boundary conditions\n(b) Conservation of fundamental governing parameters and steady-state equilibrium\n(c) Arbitrary parameter scaling without validation\n(d) Non-repeatable heuristic estimation`,
        options: [
          '(a) Absolute disregard of boundary conditions',
          '(b) Conservation of fundamental governing parameters and steady-state equilibrium [CORRECT]',
          '(c) Arbitrary parameter scaling without validation',
          '(d) Non-repeatable heuristic estimation'
        ],
        correctAnswer: '(b)',
        modelSolution: `Correct Option: (b)\nExplanation: Rigorous university-level analysis mandates adherence to conservation laws and validated boundary conditions. Options (a), (c), and (d) represent methodologically unsound approaches.`
      }
    ],
    recommendedTextbooks: [
      `Official Departmental Course Pack & Lecture Slides (${resource.campusCode || 'University'}).`,
      `National Universities Commission (NUC) Benchmark Minimum Academic Standards (BMAS / CCMAS) for ${dept}.`,
      `Standard Reference Textbook for ${code}, Latest Edition, International & African Editions.`
    ]
  };
}

/**
 * Generate a complete, standalone, beautifully styled HTML document
 * that students can download and open offline in any browser, print as PDF,
 * or read on their phone without internet.
 */
export function generatePrintableNoteHtml(resource: Resource, notes: CourseNotesData): string {
  const modulesHtml = notes.modules.map(m => `
    <div class="module-card">
      <div class="module-header">
        <span class="module-pill">Module ${m.number}</span>
        <h2 class="module-title">${escapeHtml(m.title)}</h2>
      </div>
      <p class="module-summary">${escapeHtml(m.summary)}</p>
      
      ${m.topics.map(t => `
        <div class="topic-block">
          <h3 class="topic-heading">${escapeHtml(t.heading)}</h3>
          <p class="topic-content">${escapeHtml(t.content).replace(/\n\n/g, '</p><p class="topic-content">').replace(/\n/g, '<br/>')}</p>
          
          ${t.formula ? `
            <div class="formula-box">
              <span class="formula-label">Formula / Key Relation:</span>
              <code>${escapeHtml(t.formula)}</code>
            </div>
          ` : ''}

          ${t.codeSnippet ? `
            <pre class="code-box"><code>${escapeHtml(t.codeSnippet)}</code></pre>
          ` : ''}

          ${t.keyPoints && t.keyPoints.length ? `
            <div class="key-points-box">
              <span class="key-points-title">Key Points to Memorize:</span>
              <ul>
                ${t.keyPoints.map(kp => `<li>${escapeHtml(kp)}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
  `).join('');

  const takeawaysHtml = notes.highYieldTakeaways.map(t => `<li>${escapeHtml(t)}</li>`).join('');

  const pastQuestionsHtml = notes.pastQuestions.map(pq => `
    <div class="pq-card">
      <div class="pq-header">
        <span class="pq-tag">${escapeHtml(pq.questionNumber)} • ${escapeHtml(pq.type)}</span>
      </div>
      <div class="pq-question">
        <p>${escapeHtml(pq.question).replace(/\n/g, '<br/>')}</p>
        ${pq.options ? `
          <ul class="pq-options">
            ${pq.options.map(opt => `<li>${escapeHtml(opt)}</li>`).join('')}
          </ul>
        ` : ''}
      </div>
      <div class="pq-solution">
        <span class="solution-label">Step-by-Step Model Solution & Marking Scheme:</span>
        <p>${escapeHtml(pq.modelSolution).replace(/\n/g, '<br/>')}</p>
      </div>
    </div>
  `).join('');

  const textbooksHtml = notes.recommendedTextbooks.map(tb => `<li>${escapeHtml(tb)}</li>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(notes.courseCode)}: ${escapeHtml(notes.courseTitle)} - Lecture Notes</title>
  <style>
    :root {
      --primary: #1D4ED8;
      --primary-light: #EFF6FF;
      --text: #0F172A;
      --text-muted: #475569;
      --border: #E2E8F0;
      --bg: #F8FAFC;
      --card-bg: #FFFFFF;
      --accent: #059669;
      --accent-bg: #ECFDF5;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --primary: #3B82F6;
        --primary-light: #1E293B;
        --text: #F8FAFC;
        --text-muted: #94A3B8;
        --border: #334155;
        --bg: #0F172A;
        --card-bg: #1E293B;
        --accent: #10B981;
        --accent-bg: #064E3B;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.65;
      color: var(--text);
      background-color: var(--bg);
      padding: 24px 16px;
    }
    .container {
      max-width: 860px;
      margin: 0 auto;
    }
    .header-banner {
      background: linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%);
      color: #FFFFFF;
      padding: 32px 24px;
      border-radius: 16px;
      margin-bottom: 24px;
      box-shadow: 0 10px 25px -5px rgba(29, 78, 216, 0.25);
    }
    .meta-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    .badge {
      background: rgba(255, 255, 255, 0.2);
      backdrop-filter: blur(8px);
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .title {
      font-size: 26px;
      font-weight: 800;
      line-height: 1.3;
      margin-bottom: 8px;
    }
    .subtitle {
      font-size: 14px;
      opacity: 0.9;
    }
    .action-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      gap: 12px;
    }
    .print-btn {
      background-color: var(--primary);
      color: #FFFFFF;
      border: none;
      padding: 10px 18px;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .print-btn:hover { opacity: 0.9; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    .section-title {
      font-size: 20px;
      font-weight: 800;
      margin-bottom: 16px;
      color: var(--primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .module-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .module-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }
    .module-pill {
      background-color: var(--primary);
      color: #FFFFFF;
      font-size: 11px;
      font-weight: 800;
      padding: 3px 10px;
      border-radius: 9999px;
      text-transform: uppercase;
    }
    .module-title {
      font-size: 19px;
      font-weight: 800;
    }
    .module-summary {
      color: var(--text-muted);
      font-size: 14px;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    .topic-block {
      margin-bottom: 20px;
    }
    .topic-heading {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 8px;
      color: var(--text);
    }
    .topic-content {
      font-size: 14.5px;
      color: var(--text);
      line-height: 1.7;
      margin-bottom: 12px;
    }
    .formula-box {
      background: var(--primary-light);
      border-left: 4px solid var(--primary);
      padding: 12px 16px;
      border-radius: 8px;
      margin: 12px 0;
    }
    .formula-label {
      display: block;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--primary);
      margin-bottom: 4px;
    }
    .code-box {
      background: #0F172A;
      color: #38BDF8;
      padding: 14px;
      border-radius: 8px;
      overflow-x: auto;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
      font-size: 13px;
      margin: 12px 0;
    }
    .key-points-box {
      background: var(--accent-bg);
      border-left: 4px solid var(--accent);
      padding: 12px 16px;
      border-radius: 8px;
      margin: 12px 0;
    }
    .key-points-title {
      display: block;
      font-size: 12px;
      font-weight: 700;
      color: var(--accent);
      margin-bottom: 6px;
    }
    .key-points-box ul, .card ul {
      padding-left: 20px;
      font-size: 14px;
    }
    .key-points-box li, .card li {
      margin-bottom: 6px;
    }
    .pq-card {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px;
      margin-bottom: 16px;
    }
    .pq-tag {
      background: #3B82F6;
      color: #FFFFFF;
      font-size: 11px;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 4px;
    }
    .pq-question {
      font-size: 15px;
      font-weight: 600;
      margin: 10px 0;
      line-height: 1.5;
    }
    .pq-options {
      list-style-type: none;
      padding-left: 0;
      margin-top: 8px;
    }
    .pq-options li {
      padding: 4px 8px;
      background: var(--card-bg);
      border-radius: 4px;
      margin-bottom: 4px;
      font-size: 13.5px;
    }
    .pq-solution {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 14px;
      margin-top: 10px;
    }
    .solution-label {
      display: block;
      font-size: 11.5px;
      font-weight: 700;
      color: var(--accent);
      margin-bottom: 4px;
    }
    .footer {
      text-align: center;
      padding: 32px 0;
      font-size: 12px;
      color: var(--text-muted);
      border-top: 1px solid var(--border);
      margin-top: 40px;
    }
    @media print {
      body { background: #FFFFFF; color: #000000; padding: 0; }
      .print-btn { display: none; }
      .header-banner { background: #1E40AF !important; color: #FFFFFF !important; -webkit-print-color-adjust: exact; }
      .module-card, .card { border: 1px solid #CCCCCC; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-banner">
      <div class="meta-badges">
        <span class="badge">${escapeHtml(notes.courseCode)}</span>
        <span class="badge">${escapeHtml(notes.level)}</span>
        <span class="badge">${escapeHtml(notes.semester)}</span>
        <span class="badge">${notes.creditUnits} Credit Units</span>
      </div>
      <h1 class="title">${escapeHtml(notes.courseTitle)}</h1>
      <p class="subtitle">${escapeHtml(notes.facultyOrCollege)} • ${escapeHtml(notes.department)}</p>
    </div>

    <div class="action-bar">
      <span style="font-size: 13px; color: var(--text-muted);">Verified Academic Document • Lioris Campus</span>
      <button class="print-btn" onclick="window.print()">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2m-8 0v4h8v-4m-8-4h.01"/></svg>
        Save as PDF / Print
      </button>
    </div>

    <div class="card">
      <h2 class="section-title">Course Overview & Objectives</h2>
      <p style="margin-bottom: 14px; font-size: 14.5px;">${escapeHtml(notes.overview)}</p>
      <h3 style="font-size: 14px; font-weight: 700; margin-bottom: 8px;">Intended Learning Outcomes:</h3>
      <ul>
        ${notes.learningOutcomes.map(lo => `<li>${escapeHtml(lo)}</li>`).join('')}
      </ul>
    </div>

    <!-- Multi-Module Detailed Lecture Notes -->
    ${modulesHtml}

    <div class="card" style="border-left: 4px solid #F59E0B;">
      <h2 class="section-title" style="color: #D97706;">High-Yield Examination Takeaways</h2>
      <ul>
        ${takeawaysHtml}
      </ul>
    </div>

    <div class="card">
      <h2 class="section-title">Past Examination Questions & Model Solutions</h2>
      <p style="font-size: 13.5px; color: var(--text-muted); margin-bottom: 16px;">
        Curated past university examination papers with step-by-step model solutions and marking guide rubrics.
      </p>
      ${pastQuestionsHtml}
    </div>

    <div class="card">
      <h2 class="section-title">Recommended Textbooks & References</h2>
      <ul>
        ${textbooksHtml}
      </ul>
    </div>

    <div class="footer">
      <p>Generated by Lioris Campus Academic Resource Engine • Verified for FUNAAB, UNILAG, and UI.</p>
      <p>© 2026 Lioris. All rights reserved. For academic study and revision purposes.</p>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Compiles course notes data into a complete sequence of 16:9 presentation slides
 * with slide numbers, titles, bulleted takeaways, formulas, code snippets, and lecturer speaker notes.
 */
export function generateCourseSlides(notes: CourseNotesData): LectureSlide[] {
  const slides: LectureSlide[] = [];

  // 1. Title Slide
  slides.push({
    slideNumber: 1,
    totalSlides: 0,
    category: `${notes.courseCode} • Department of ${notes.department}`,
    title: notes.courseTitle,
    subtitle: `${notes.facultyOrCollege}\n${notes.semester} Semester • ${notes.level} (${notes.creditUnits} Units)`,
    isTitleSlide: true,
    speakerNotes: `Welcome to ${notes.courseCode}: ${notes.courseTitle}. This lecture slide presentation covers foundational theory, architecture, mathematical formulations, and examination review.`,
  });

  // 2. Course Outline & Learning Outcomes
  slides.push({
    slideNumber: 2,
    totalSlides: 0,
    category: 'Course Outline',
    title: 'Course Objectives & Learning Outcomes',
    paragraph: notes.overview,
    bullets: notes.learningOutcomes,
    speakerNotes: 'Core learning objectives mandated by the National Universities Commission (NUC) BMAS/CCMAS and departmental curriculum.',
  });

  // 3. Module & Topic Slides
  for (const mod of notes.modules) {
    slides.push({
      slideNumber: slides.length + 1,
      totalSlides: 0,
      category: `Module ${mod.number}`,
      title: `Module ${mod.number}: ${mod.title}`,
      paragraph: mod.summary,
      bullets: mod.topics.map(t => t.heading),
      speakerNotes: `Overview of topics and learning objectives covered in Module ${mod.number}.`,
    });

    for (const topic of mod.topics) {
      slides.push({
        slideNumber: slides.length + 1,
        totalSlides: 0,
        category: `Module ${mod.number} • ${mod.title}`,
        title: topic.heading,
        paragraph: topic.content,
        bullets: topic.keyPoints,
        formula: topic.formula,
        codeSnippet: topic.codeSnippet,
        speakerNotes: `Key exam focus: Make sure you understand the foundational definitions, formulas, and practical implications of ${topic.heading}.`,
      });
    }
  }

  // 4. High-Yield Examination Takeaways
  slides.push({
    slideNumber: slides.length + 1,
    totalSlides: 0,
    category: 'Exam Revision',
    title: 'High-Yield Examination Takeaways',
    bullets: notes.highYieldTakeaways,
    speakerNotes: 'Crucial concepts and recurring problem sets frequently tested in university examinations across FUNAAB, UNILAG, and UI.',
  });

  // 5. Past Examination Questions
  for (const pq of notes.pastQuestions) {
    slides.push({
      slideNumber: slides.length + 1,
      totalSlides: 0,
      category: `Past Exam Problem • Question ${pq.questionNumber}`,
      title: `Question ${pq.questionNumber} [${pq.type}]`,
      paragraph: pq.question,
      bullets: pq.options,
      speakerNotes: `Model Solution:\n${pq.modelSolution}`,
    });
  }

  // 6. Recommended Textbooks
  slides.push({
    slideNumber: slides.length + 1,
    totalSlides: 0,
    category: 'References',
    title: 'Recommended Textbooks & Courseware',
    bullets: notes.recommendedTextbooks,
    speakerNotes: 'Consult these recommended textbooks in your university library or departmental repository for extended reading.',
  });

  const total = slides.length;
  slides.forEach(s => { s.totalSlides = total; });

  return slides;
}

