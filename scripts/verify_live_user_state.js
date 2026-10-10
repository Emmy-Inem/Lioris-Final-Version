const { createClient } = require('@supabase/supabase-js');
const https = require('https');

const SUPABASE_URL = 'https://fdtnbluslkabwsmspbem.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_TB0Pw8k2oJQTmoO951YaIQ_xzOyGpZF';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function checkUrl(url) {
  return new Promise((resolve) => {
    if (!url) return resolve({ ok: false, error: 'Empty URL' });
    try {
      const req = https.get(url, (res) => {
        resolve({
          ok: res.statusCode === 200,
          statusCode: res.statusCode,
          contentType: res.headers['content-type'],
          contentLength: res.headers['content-length'],
        });
      });
      req.on('error', (err) => resolve({ ok: false, error: err.message }));
      req.setTimeout(5000, () => {
        req.destroy();
        resolve({ ok: false, error: 'Timeout' });
      });
    } catch (err) {
      resolve({ ok: false, error: err.message });
    }
  });
}

async function runVerification() {
  console.log('====================================================');
  console.log('LIVE ENVIRONMENT VERIFICATION SUITE');
  console.log('Target: inememmanuel@gmail.com (Super Admin)');
  console.log('====================================================\n');

  let allPassed = true;

  // 1. Query Super Admin profile from remote Supabase
  console.log('[1/5] Fetching Super Admin profile from remote Supabase...');
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, email, full_name, username, role, admin_role, campus_code, avatar_url, banner_url, verification_status, is_campus_ambassador, onboarding_step')
    .eq('email', 'inememmanuel@gmail.com')
    .single();

  if (profileErr || !profile) {
    console.error('❌ FAILED to fetch profile:', profileErr);
    allPassed = false;
  } else {
    console.log('✅ Profile fetched successfully:');
    console.log(`   - ID: ${profile.id}`);
    console.log(`   - Full Name: ${profile.full_name}`);
    console.log(`   - Username: @${profile.username}`);
    console.log(`   - Role: ${profile.role} (admin_role: ${profile.admin_role})`);
    console.log(`   - Campus: ${profile.campus_code}`);
    console.log(`   - Avatar URL: ${profile.avatar_url}`);
    console.log(`   - Banner URL: ${profile.banner_url}`);

    // 2. Verify Avatar URL accessibility
    console.log('\n[2/5] Testing Avatar URL public accessibility...');
    const avatarCheck = await checkUrl(profile.avatar_url);
    if (avatarCheck.ok) {
      console.log(`✅ Avatar URL accessible (HTTP ${avatarCheck.statusCode}, ${avatarCheck.contentType}, ${avatarCheck.contentLength} bytes)`);
    } else {
      console.error('❌ Avatar URL NOT accessible:', avatarCheck);
      allPassed = false;
    }

    // 3. Verify Banner URL accessibility
    console.log('\n[3/5] Testing Cover Banner URL public accessibility...');
    const bannerCheck = await checkUrl(profile.banner_url);
    if (bannerCheck.ok) {
      console.log(`✅ Banner URL accessible (HTTP ${bannerCheck.statusCode}, ${bannerCheck.contentType}, ${bannerCheck.contentLength} bytes)`);
    } else {
      console.error('❌ Banner URL NOT accessible:', bannerCheck);
      allPassed = false;
    }
  }

  // 4. Verify Academic Resources
  console.log('\n[4/5] Checking Academic Resources...');
  const { data: resources, count: resCount, error: resErr } = await supabase
    .from('resources')
    .select('id, title, campus_code, is_approved', { count: 'exact' })
    .limit(10);

  if (resErr) {
    console.error('❌ FAILED to query resources:', resErr);
    allPassed = false;
  } else {
    console.log(`✅ Academic Resources: ${resCount} public/global items accessible.`);
    if (resources && resources.length > 0) {
      console.log(`   Sample item: "${resources[0].title}" (Campus: ${resources[0].campus_code || 'GLOBAL'})`);
    }
  }

  // 5. Verify Upcoming Events
  console.log('\n[5/5] Checking Upcoming Events...');
  const { data: events, error: eventsErr } = await supabase
    .from('events')
    .select('id, title, campus_code, start_time, status')
    .order('start_time', { ascending: true })
    .limit(10);

  if (eventsErr) {
    console.error('❌ FAILED to query events:', eventsErr);
    allPassed = false;
  } else {
    console.log(`✅ Events fetched: ${events.length} events accessible:`);
    events.slice(0, 5).forEach((e) => {
      console.log(`   • [${e.campus_code || 'GLOBAL'}] ${e.title} (${e.start_time})`);
    });
  }

  console.log('\n====================================================');
  if (allPassed) {
    console.log('🎉 ALL LIVE VERIFICATIONS PASSED 100%');
  } else {
    console.log('❌ SOME VERIFICATIONS FAILED');
  }
  console.log('====================================================');

  process.exit(allPassed ? 0 : 1);
}

runVerification();
