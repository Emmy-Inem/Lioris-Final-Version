import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { inferWorkplaceType, inferExperienceLevel } from './careerFilters.ts';

test('careerFilters and LinkedIn-style job matching suite', async (t) => {
  await t.test('inferWorkplaceType accurately classifies job postings', () => {
    assert.equal(inferWorkplaceType({ workplace_type: 'Hybrid' }), 'Hybrid');
    assert.equal(inferWorkplaceType({ is_remote: true }), 'Remote');
    assert.equal(inferWorkplaceType({ location: 'Remote, Nigeria' }), 'Remote');
    assert.equal(inferWorkplaceType({ location: 'Lagos Island (Hybrid 3 days)' }), 'Hybrid');
    assert.equal(inferWorkplaceType({ description: 'This role is fully remote for Nigerian engineers' }), 'Remote');
    assert.equal(inferWorkplaceType({ location: 'Victoria Island, Lagos' }), 'On-site');
  });

  await t.test('inferExperienceLevel accurately determines career seniority', () => {
    assert.equal(inferExperienceLevel({ experience_level: 'Executive' }), 'Executive');
    assert.equal(inferExperienceLevel({ title: 'VP of Engineering' }), 'Executive');
    assert.equal(inferExperienceLevel({ title: 'Chief Technology Officer (CTO)' }), 'Executive');
    assert.equal(inferExperienceLevel({ title: 'Director of Alumni Relations' }), 'Executive');
    assert.equal(inferExperienceLevel({ title: 'Senior Fullstack Engineer' }), 'Mid-Senior level');
    assert.equal(inferExperienceLevel({ title: 'Lead Product Manager' }), 'Mid-Senior level');
    assert.equal(inferExperienceLevel({ description: 'Looking for 5+ years of experience with PostgreSQL' }), 'Mid-Senior level');
    assert.equal(inferExperienceLevel({ title: 'Graduate Trainee - Operations' }), 'Entry level');
    assert.equal(inferExperienceLevel({ title: 'Frontend Developer Intern' }), 'Entry level');
  });

  await t.test('LinkedIn-style multi-filter behavior isolates matching listings', () => {
    const sampleJobs: JobListing[] = [
      {
        id: 'job-1',
        title: 'Senior Software Engineer',
        company: 'Paystack',
        location: 'Lagos',
        type: 'Full-time',
        remote: true,
        workplaceType: 'Remote',
        experienceLevel: 'Mid-Senior level',
        applyUrl: 'https://paystack.com/careers/1',
        postedByName: 'Alumni Fellow',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        isSaved: true,
      },
      {
        id: 'job-2',
        title: 'Graduate Data Analyst',
        company: 'Interswitch',
        location: 'Lagos',
        type: 'Full-time',
        remote: false,
        workplaceType: 'Hybrid',
        experienceLevel: 'Entry level',
        applyUrl: 'https://interswitch.com/careers/2',
        postedByName: 'Alumni Fellow',
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
        isSaved: false,
      },
      {
        id: 'job-3',
        title: 'Vice President of Finance',
        company: 'Flutterwave',
        location: 'Lagos',
        type: 'Full-time',
        remote: false,
        workplaceType: 'On-site',
        experienceLevel: 'Executive',
        applyUrl: 'https://flutterwave.com/careers/3',
        postedByName: 'Alumni Recruiter',
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
        isSaved: true,
      },
      {
        id: 'job-4',
        title: 'Frontend Engineering Intern',
        company: 'Moniepoint',
        location: 'Remote',
        type: 'Internship',
        remote: true,
        workplaceType: 'Remote',
        experienceLevel: 'Entry level',
        applyUrl: 'https://moniepoint.com/careers/4',
        postedByName: 'Alumni Mentor',
        createdAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(), // 35 days ago
        isSaved: false,
      },
    ];

    // Filter 1: Saved Only
    const saved = sampleJobs.filter((j) => j.isSaved);
    assert.equal(saved.length, 2);
    assert.deepEqual(saved.map((j) => j.id), ['job-1', 'job-3']);

    // Filter 2: Workplace Type 'Remote'
    const remoteOnly = sampleJobs.filter((j) => j.workplaceType === 'Remote');
    assert.equal(remoteOnly.length, 2);
    assert.deepEqual(remoteOnly.map((j) => j.id), ['job-1', 'job-4']);

    // Filter 3: Experience Level 'Executive'
    const executive = sampleJobs.filter((j) => j.experienceLevel === 'Executive');
    assert.equal(executive.length, 1);
    assert.equal(executive[0].id, 'job-3');

    // Filter 4: Date Posted 'past24h'
    const now = Date.now();
    const past24h = sampleJobs.filter((j) => now - new Date(j.createdAt).getTime() <= 24 * 60 * 60 * 1000);
    assert.equal(past24h.length, 1);
    assert.equal(past24h[0].id, 'job-1');

    // Filter 5: Date Posted 'pastWeek'
    const pastWeek = sampleJobs.filter((j) => now - new Date(j.createdAt).getTime() <= 7 * 24 * 60 * 60 * 1000);
    assert.equal(pastWeek.length, 2);
    assert.deepEqual(pastWeek.map((j) => j.id), ['job-1', 'job-2']);

    // Filter 6: Combined multi-criteria (Full-time + Saved + Mid-Senior level)
    const combined = sampleJobs.filter(
      (j) => j.type === 'Full-time' && j.isSaved && j.experienceLevel === 'Mid-Senior level',
    );
    assert.equal(combined.length, 1);
    assert.equal(combined[0].id, 'job-1');
  });
});
