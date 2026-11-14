// One migration per account at a time. An old account's network request must
// not block a newly signed-in account or apply its late acknowledgement there.
export function createAccountPinMigrationQueue(activeOwner) {
  const requests = new Map();
  return function queue(participantId, save, applyConfirmed) {
    if (requests.has(participantId)) return requests.get(participantId);
    const request = Promise.resolve()
      .then(save)
      .then(result => {
        if (activeOwner() === participantId) applyConfirmed(result);
        return result;
      })
      .finally(() => {
        if (requests.get(participantId) === request) requests.delete(participantId);
      });
    requests.set(participantId, request);
    return request;
  };
}
