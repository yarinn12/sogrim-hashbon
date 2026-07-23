const nativeMutationObserver = window.MutationObserver;

if (nativeMutationObserver && !window.__sogrimMutationObserverThrottled) {
  window.__sogrimMutationObserverThrottled = true;

  window.MutationObserver = class SogrimScheduledMutationObserver extends nativeMutationObserver {
    constructor(callback) {
      let scheduled = false;
      let latestRecords = [];

      super((records, observer) => {
        latestRecords = records;
        if (scheduled) return;

        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          const nextRecords = latestRecords;
          latestRecords = [];
          callback(nextRecords, observer);
        });
      });
    }
  };
}
