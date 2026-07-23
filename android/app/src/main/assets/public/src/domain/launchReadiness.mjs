export function getLaunchReadinessItems(config) {
  const launch = config.launch ?? {};

  return [
    {
      label: "כתובת ציבורית",
      status: launch.publicUrlReady ? "ready" : "missing"
    },
    {
      label: "שמירה משותפת בענן",
      status: launch.cloudStorageReady ? "ready" : "missing"
    },
    {
      label: "כניסה עם Google",
      status: launch.googleAuthReady ? "ready" : "optional"
    },
    {
      label: "קישור שאפשר לשלוח לחברים",
      status: launch.shareLinksReady ? "ready" : "missing"
    }
  ];
}
