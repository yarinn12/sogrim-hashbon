(() => {
  const userId = 'ios-native-qa-owner', participantId = 'account-' + userId;
  const space = 'ios-native-qa-space', key = 'synthetic-ios-native-space-key-123456';
  const auth = 'https://ios-native-qa.supabase.co';
  const user = { id: userId, email: 'ios-native@example.test', app_metadata: { provider: 'google' }, user_metadata: { full_name: 'בודק iOS', username: 'ios_native_qa', account_space_id: space, account_space_key: key } };
  const state = { currentParticipantId: participantId, participants: [{ id: participantId, displayName: 'בודק iOS', kind: 'user', accountLinked: true, avatarPreset: 'avatar-1' }, { id: 'ios-native-guest', displayName: 'אורח בדיקה', kind: 'guest' }], groups: [], friendContacts: [], deletedEvents: [], deletedParticipants: [], events: [{ id: 'ios-native-event', name: 'אירוע בדיקת iOS', eventType: 'standard', currency: 'ILS', participantIds: [participantId, 'ios-native-guest'], adminIds: [participantId], createdByParticipantId: participantId, createdAt: '2026-10-10T10:00:00.000Z', updatedAt: '2026-10-10T10:00:00.000Z', expenses: [], transfers: [], activityLog: [] }] };
  state.participants[1].displayName = 'אורח בדיקה עם שם ארוך מאוד לצורך תצוגה';
  state.participants.push({ id: 'ios-native-guest-two', displayName: 'בודק שלישי', kind: 'guest' });
  state.events[0].participantIds.push('ios-native-guest-two');
  state.events[0].expenses.push({ id: 'native-seeded-multi-payer', name: 'הוצאה עם שני משלמים', total: 12000, payers: [{ participantId, amount: 7000 }, { participantId: 'ios-native-guest', amount: 5000 }], sharedByParticipantIds: [...state.events[0].participantIds], createdByParticipantId: participantId, occurredOn: '2026-10-10', updatedAt: '2026-10-10T10:00:00.000Z' });
  // Two debtors owe the owner: use the ordinary pending hero, whose essential
  // description/status/helper text contains the typography regression.
  state.events[0].expenses.push({ id: 'native-seeded-owner-payment', name: 'הוצאה נוספת למבחן סיכום', total: 12000, payers: [{ participantId, amount: 12000 }], sharedByParticipantIds: [...state.events[0].participantIds], createdByParticipantId: participantId, occurredOn: '2026-10-10', updatedAt: '2026-10-10T10:00:00.000Z' });
  state.events[0].notes = [{ id:'native-seeded-note', title:'פרטי טיסה ארוכים ושמות המשתתפים בבדיקת iOS',body:'תוכן סינתטי לצורך בדיקת תצוגת פתקים במעטפת iOS בלבד.',pinned:true,createdByParticipantId:participantId,updatedByParticipantId:participantId,createdAt:'2026-10-10T10:00:00.000Z',updatedAt:'2026-10-10T10:00:00.000Z' }];
  if (!localStorage.getItem('qa-native-initialized')) {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('settle-friends-account-session', JSON.stringify({ access_token: 'synthetic-native-token', refresh_token: 'synthetic-native-refresh', expires_at: Math.floor(Date.now() / 1000) + 86400, user }));
    localStorage.setItem('settle-friends-local-profile:account:' + userId, JSON.stringify({ participantId, displayName: 'בודק iOS', avatarPreset: 'avatar-1', authProvider: 'google', authSubject: userId, email: user.email }));
    localStorage.setItem('settle-friends-cloud-space', space);
    localStorage.setItem('settle-friends-cloud-key:' + space, key);
    localStorage.setItem('settle-friends-state:' + space, JSON.stringify(state));
    localStorage.setItem('settle-friends-current-participant:account:' + userId, participantId);
    localStorage.setItem('qa-native-server-row', JSON.stringify({ id: space, state, updated_at: '2026-10-10T10:00:00.000Z' }));
    localStorage.setItem('qa-native-initialized', '1');
  }
  sessionStorage.setItem('settle-friends-skip-next-splash', '1');
  // The emulator's network is physically disabled. Advertise only the
  // availability of this synthetic service so the real outbox can send its
  // payload to the fixture. This does not test real connectivity or recovery.
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
  const config = { publicUrl: 'https://sogrim-hesbon-app.vercel.app', apiBaseUrl: 'https://sogrim-hesbon-app.vercel.app', auth: { googleClientId: 'synthetic-ios.apps.googleusercontent.com' }, storage: { mode: 'supabase', url: auth, anonKey: 'synthetic-ios-native-anon', table: 'app_snapshots' }, updates: { ios: { minimumSupportedBuild: 0, currentBuild: 187, required: false, storeUrl: 'https://play.google.com/store/apps/details?id=com.sogrimhashbon.app' } }, monetization: { adsEnabled: false, premiumEnabled: false }, launch: { googleAuthReady: true, authEmailDeliveryReady: true } };
  Object.defineProperty(globalThis, 'SogrimNativeRuntimeConfig', { configurable: false, get: () => config, set: () => {} });
  const originalFetch = globalThis.fetch.bind(globalThis);
  const response = (data, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }));
  const append = (key, value) => { const values = JSON.parse(localStorage.getItem(key) || '[]'); values.push(value); localStorage.setItem(key, JSON.stringify(values)); };
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const method = String(options.method || input?.method || 'GET').toUpperCase();
    const body = options.body ? JSON.parse(options.body) : null;
    if (url.pathname === '/api/config') return response(config);
    if (url.pathname === '/api/health') return response({ ok: true, fixture: true });
    if (url.pathname === '/api/admin/overview') return response({ message: 'Synthetic user is not an admin' }, 403);
    if (url.pathname === '/api/product-metrics') return response({ ok: true, accepted: body?.events?.length || 0 });
    if (url.origin === auth) {
      if (url.pathname === '/auth/v1/user') return response(user);
      if (url.pathname.endsWith('/rpc/ensure_account_workspace')) return response({ status: 'existing', workspaceId: space });
      if (url.pathname.endsWith('/rpc/get_referral_program_status')) return response({ referral_code: '', ad_free_active: false, reward_days: 30 });
      if (url.pathname.endsWith('/app_snapshots')) {
        let row = JSON.parse(localStorage.getItem('qa-native-server-row'));
        if (method === 'GET') {
          if (url.searchParams.has('snapshot_kind')) return response([]);
          const fields = (url.searchParams.get('select') || 'id,state,updated_at').split(',');
          return response([Object.fromEntries(fields.map(field => [field, row[field]]))]);
        }
        const payload = Array.isArray(body) ? body[0] : body;
        if (!payload?.state || !(url.searchParams.get('id') === 'eq.' + space || payload.id === space)) return response({ message: 'Fixture rejects unexpected snapshot identity' }, 400);
        if (method === 'PATCH' && url.searchParams.get('updated_at') !== 'eq.' + row.updated_at) return response([]);
        row = { ...row, state: payload.state, updated_at: payload.updated_at || new Date().toISOString() };
        localStorage.setItem('qa-native-server-row', JSON.stringify(row));
        append('qa-native-writes', { method, state: row.state, updated_at: row.updated_at });
        return response([{ updated_at: row.updated_at }]);
      }
      if (url.pathname.endsWith('/user_profiles')) return response([{ user_id: userId, username: 'ios_native_qa', display_name: 'בודק iOS', avatar_preset: 'avatar-1', updated_at: '2026-10-10T10:00:00.000Z' }]);
      if (method === 'GET') return response([]);
      if (url.pathname.endsWith('/rpc/upsert_user_profile')) return response({ ok: true });
      append('qa-native-unhandled', { method, path: url.pathname });
      return response({ message: 'Unsupported synthetic endpoint' }, 501);
    }
    if (url.origin === location.origin && !url.pathname.startsWith('/api/')) return originalFetch(input, options);
    append('qa-native-blocked-network', { method, origin: url.origin, path: url.pathname });
    throw new Error('Isolated iOS QA blocks external request: ' + url.origin + url.pathname);
  };
})();
