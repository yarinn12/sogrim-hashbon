// A new document gets a new identity from addInitScript. Frame navigation
// events alone cannot prove this: History API changes also emit them.
export function createDeniedSessionDocumentBoundary() {
  let deniedDocumentIdentity = null;
  let observedDocumentIdentity = null;
  let loads = 0;
  let navigationResponses = 0;
  let frameNavigations = 0;
  const hasPostDenialDocument = () => Boolean(
    deniedDocumentIdentity && observedDocumentIdentity &&
    observedDocumentIdentity !== deniedDocumentIdentity
  );
  return {
    response() { navigationResponses++; },
    commit() { frameNavigations++; },
    load() { loads++; },
    deny(identity) {
      if (typeof identity !== "string" || !identity) {
        throw new Error("The denied document has no identity");
      }
      deniedDocumentIdentity = identity;
    },
    observe(identity) {
      observedDocumentIdentity = typeof identity === "string" && identity ? identity : null;
    },
    hasPostDenialDocument,
    receipt() {
      return { deniedDocumentIdentity, observedDocumentIdentity, loads,
        navigationResponses, frameNavigations,
        postDenialDocument: hasPostDenialDocument() };
    }
  };
}
