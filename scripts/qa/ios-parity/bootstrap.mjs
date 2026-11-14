export function iosParityBootstrap(build) {
  if (!Number.isInteger(build) || build <= 0) throw new Error('A positive native build is required');
  return {
    storage: { mode: 'supabase', url: 'https://ios-native-qa.supabase.co', anonKey: 'synthetic-ios-native-anon' },
    auth: {}, updates: { android: {
      currentBuild: build, required: false,
      storeUrl: 'https://play.google.com/store/apps/details?id=com.sogrimhashbon.app'
    } }
  };
}
