export function inferWorkplaceType(row: any): 'Remote' | 'Hybrid' | 'On-site' {
  if (row.workplace_type) return row.workplace_type;
  if (row.is_remote) return 'Remote';
  const loc = (row.location || '').toLowerCase();
  const desc = (row.description || '').toLowerCase();
  if (loc.includes('hybrid') || desc.includes('hybrid')) return 'Hybrid';
  if (loc.includes('remote') || desc.includes('remote')) return 'Remote';
  return 'On-site';
}

export function inferExperienceLevel(row: any): 'Entry level' | 'Mid-Senior level' | 'Executive' {
  if (row.experience_level) return row.experience_level;
  const text = `${row.title || ''} ${row.description || ''}`.toLowerCase();
  if (
    text.includes('director') ||
    text.includes('executive') ||
    text.includes('vp') ||
    text.includes('chief') ||
    text.includes('head of')
  ) {
    return 'Executive';
  }
  if (
    text.includes('senior') ||
    text.includes('lead') ||
    text.includes('manager') ||
    text.includes('5+ years') ||
    text.includes('mid-level') ||
    text.includes('mid-senior')
  ) {
    return 'Mid-Senior level';
  }
  return 'Entry level';
}
