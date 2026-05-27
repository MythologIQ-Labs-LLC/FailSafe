export function parseCommandCenterHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const [path = '', query = ''] = raw.split('?');
  const [tab = '', subview = ''] = path.split(':');
  const params = new URLSearchParams(query);
  return { tab, subview, params };
}

export function governanceSubviewForRoute(route) {
  if (!route || route.tab !== 'governance') return '';
  if (route.subview) return route.subview;
  if (route.params?.has('risk') || route.params?.has('severity')) return 'risks';
  if (route.params?.has('verdict') || route.params?.has('event')) return 'audit';
  if (route.params?.has('l3') || route.params?.has('section')) return 'compliance';
  if (route.params?.has('transition') || route.params?.has('mode')) return 'compliance';
  return '';
}

export function navigationHash(nav) {
  const [target = '', query = ''] = String(nav || '').split('?');
  const [tab = '', subview = ''] = target.split(':');
  const path = subview ? `${tab}:${subview}` : tab;
  return query ? `#${path}?${query}` : `#${path}`;
}
