const nativeMutationObserver = window.MutationObserver;

if (nativeMutationObserver && !window.__sogrimMutationObserverThrottled) {
  window.__sogrimMutationObserverThrottled = true;
  const deliveries = new WeakMap();

  function cancelDelivery(delivery) {
    delivery.generation += 1;
    if (delivery.frameId !== null) cancelAnimationFrame(delivery.frameId);
    delivery.frameId = null;
  }

  window.MutationObserver = class SogrimScheduledMutationObserver extends nativeMutationObserver {
    constructor(callback) {
      if (typeof callback !== "function") {
        throw new TypeError("MutationObserver callback must be a function");
      }
      const delivery = { records: [], frameId: null, generation: 0 };

      super((records, observer) => {
        // Native delivery can run several times before the next paint. Keep
        // every batch; later mutations must not erase earlier DOM changes.
        for (const record of records) delivery.records.push(record);
        if (delivery.frameId !== null) return;

        const generation = delivery.generation;
        delivery.frameId = requestAnimationFrame(() => {
          if (generation !== delivery.generation) return;
          delivery.frameId = null;
          const nextRecords = delivery.records;
          delivery.records = [];
          if (nextRecords.length) callback.call(observer, nextRecords, observer);
        });
      });
      deliveries.set(this, delivery);
    }

    disconnect() {
      super.disconnect();
      const delivery = deliveries.get(this);
      delivery.records = [];
      cancelDelivery(delivery);
    }

    takeRecords() {
      const nativeRecords = super.takeRecords();
      const delivery = deliveries.get(this);
      const records = delivery.records.concat(nativeRecords);
      delivery.records = [];
      cancelDelivery(delivery);
      return records;
    }
  };
}
