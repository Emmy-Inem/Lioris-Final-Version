import test from 'node:test';
import assert from 'node:assert/strict';
// Node's type stripping needs the explicit .ts extension; tsc does not allow it without allowImportingTsExtensions.
// @ts-ignore TS5097
import { getCourseLectureNotes, generatePrintableNoteHtml, SPECIFIC_COURSE_NOTES } from '../data/courseNotesRepository.ts';
import type { Resource } from '../api/types.ts';

test('SPECIFIC_COURSE_NOTES includes complete textbook-grade notes for CSC 101', () => {
  const csc101 = SPECIFIC_COURSE_NOTES['CSC 101'];
  assert.ok(csc101, 'CSC 101 notes must be defined');
  assert.equal(csc101.courseCode, 'CSC 101');
  assert.equal(csc101.creditUnits, 3);
  assert.ok(csc101.modules.length >= 4, 'Must have at least 4 structured modules');
  assert.ok(csc101.learningOutcomes.length >= 4, 'Must have clear learning outcomes');
  assert.ok(csc101.highYieldTakeaways.length >= 3, 'Must have high yield takeaways');
  assert.ok(csc101.pastQuestions.length >= 3, 'Must have past exam questions');
  assert.ok(csc101.recommendedTextbooks.length >= 2, 'Must have recommended textbooks');

  // Verify Von Neumann and past question model solutions exist
  const module2 = csc101.modules.find(m => m.number === 2);
  assert.ok(module2, 'Module 2 must exist');
  assert.ok(module2.topics.some(t => t.heading.includes('Von Neumann')), 'Must cover Von Neumann architecture');

  const calcProblem = csc101.pastQuestions.find(pq => pq.type === 'Calculation');
  assert.ok(calcProblem, 'Must have calculation past question');
  assert.ok(calcProblem.modelSolution.includes('Step 1') || calcProblem.modelSolution.length > 50, 'Model solution must be comprehensive');
});

test('getCourseLectureNotes generates authentic structured notes for any course', () => {
  const mockResource: Resource = {
    id: 'res-test-chm',
    title: 'General Physical Chemistry',
    courseCode: 'CHM 101',
    department: 'Chemistry',
    category: 'Lecture Notes',
    authorName: 'Dr. A. Adebayo',
    authorAvatar: null,
    likesCount: 15,
    downloadsCount: 42,
    createdAt: new Date().toISOString(),
    isBookmarked: false,
    fileSize: '1.2 MB',
    fileUrl: null,
    description: 'Fundamental principles of physical chemistry, thermodynamics, and kinetics.',
  };

  const notes = getCourseLectureNotes(mockResource);
  assert.equal(notes.courseCode, 'CHM 101');
  assert.equal(notes.courseTitle, 'General Physical Chemistry');
  assert.ok(notes.modules.length >= 4, 'Must generate 4 comprehensive modules');
  assert.ok(notes.pastQuestions.length >= 3, 'Must generate past exam questions with model answers');
  assert.ok(notes.highYieldTakeaways.length >= 3, 'Must generate exam takeaways');
});

test('generatePrintableNoteHtml outputs standalone printable HTML with print styles and content', () => {
  const mockResource: Resource = {
    id: 'res-test-csc',
    title: 'Introduction to Computer Science',
    courseCode: 'CSC 101',
    department: 'Computer Science',
    category: 'Lecture Notes',
    authorName: 'Department of Computer Science',
    authorAvatar: null,
    likesCount: 20,
    downloadsCount: 100,
    createdAt: new Date().toISOString(),
    isBookmarked: false,
    fileSize: '1.8 MB',
    fileUrl: null,
  };

  const notes = getCourseLectureNotes(mockResource);
  const html = generatePrintableNoteHtml(mockResource, notes);

  assert.ok(html.includes('<!DOCTYPE html>'), 'Must be valid HTML5 document');
  assert.ok(html.includes('@media print'), 'Must include print-to-PDF styles');
  assert.ok(html.includes('CSC 101'), 'Must include course code');
  assert.ok(html.includes('Module 1'), 'Must include module badge/number');
  assert.ok(html.includes('Historical Evolution'), 'Must include module headings');
  assert.ok(html.includes('Past Examination Questions &amp; Model Solutions') || html.includes('Past Examination Questions & Model Solutions'), 'Must include past questions section');
  assert.ok(html.includes('window.print()'), 'Must include print button trigger');
});
