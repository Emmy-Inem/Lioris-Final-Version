import { api } from'./client';
import { withMockFallback } from'./withMockFallback';
import { FALL_BACK_TO_MOCKS } from'./config';

export interface Course {
 id: string;
 courseCode: string;
 title: string;
 department: string;
 units: number;
 level: number;
 lecturerName?: string;
 description: string;
 coverImageUrl?: string;
 syllabusTopics?: string[];
 enrolledStudentsCount: number;
 resourcesCount: number;
}

export const INITIAL_COURSES: Course[] = [
 {
 id: 'course-1',
 courseCode: 'CSC 301',
 title: 'Advanced Data Structures & Algorithms',
 department: 'Computer Science & AI',
 units: 4,
 level: 300,
 lecturerName: 'Dr. Tunde Adeyemi',
 description: 'Graph algorithms, dynamic programming, complexity classes, and tree balance invariants.',
 coverImageUrl: 'campus_library_study',
 syllabusTopics: ['Dynamic Programming', 'Graph Theory', 'B-Trees', 'NP Completeness'],
 enrolledStudentsCount: 142,
 resourcesCount: 18,
 },
 {
 id: 'course-2',
 courseCode: 'CSC 201',
 title: 'Object-Oriented Software Design',
 department: 'Computer Science & AI',
 units: 3,
 level: 200,
 lecturerName: 'Prof. Amaka Okafor',
 description: 'Design patterns, SOLID principles, TypeScript and Java application architecture.',
 coverImageUrl: 'event_tech_hackathon',
 syllabusTopics: ['Encapsulation', 'Factory Patterns', 'Concurrency', 'Unit Testing'],
 enrolledStudentsCount: 198,
 resourcesCount: 24,
 },
 {
 id: 'course-3',
 courseCode: 'MAT 201',
 title: 'Linear Algebra & Differential Calculus',
 department: 'Mathematics & Statistics',
 units: 4,
 level: 200,
 lecturerName: 'Dr. Michael Chen',
 description: 'Vector spaces, matrix decomposition, eigenvalues, and Fourier analysis.',
 coverImageUrl: 'campus_students_photo',
 syllabusTopics: ['Vector Spaces', 'Eigenvalues', 'Matrix Factorization', 'Transforms'],
 enrolledStudentsCount: 260,
 resourcesCount: 31,
 },
 {
 id: 'course-4',
 courseCode: 'EEE 305',
 title: 'Digital Signal Processing & Embedded Systems',
 department: 'Electrical Engineering',
 units: 3,
 level: 300,
 lecturerName: 'Engr. Sarah Jenkins',
 description: 'Microcontroller architecture, ADC/DAC conversion, and IoT firmware development.',
 coverImageUrl: 'hero_student_3d',
 syllabusTopics: ['DSP Filtering', 'ARM Cortex', 'Interrupt Handlers', 'SPI/I2C Protocols'],
 enrolledStudentsCount: 88,
 resourcesCount: 12,
 },
];

let coursesState = [...INITIAL_COURSES];

export async function listCourses(department?: string): Promise<Course[]> {
 return withMockFallback(async () => {
 const { data } = await api.get<{ items: Course[] }>('/courses', { params: { department } });
 return data.items;
 }, department ? coursesState.filter((c) => c.department === department) : coursesState);
}

export async function createCourse(payload: Omit<Course, 'id' | 'enrolledStudentsCount' | 'resourcesCount'>): Promise<Course> {
 const newCourse: Course = {
 id: `course-${Date.now()}`,
 ...payload,
 enrolledStudentsCount: 0,
 resourcesCount: 0,
 };
 coursesState = [newCourse, ...coursesState];
 return newCourse;
}

export async function updateCourse(id: string, payload: Partial<Course>): Promise<Course> {
 let updated: Course | undefined;
 coursesState = coursesState.map((c) => {
 if (c.id === id) {
 updated = { ...c, ...payload };
 return updated;
 }
 return c;
 });
 if (!updated) throw new Error('Course not found');
 return updated;
}

export async function deleteCourse(id: string): Promise<boolean> {
 coursesState = coursesState.filter((c) => c.id !== id);
 return true;
}
