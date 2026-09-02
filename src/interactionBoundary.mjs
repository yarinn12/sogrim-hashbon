export function runGuardedInteraction(handler, event, reportFailure) {
  let result;
  try {
    // The handler must start in the browser's dispatch stack. Deferring it to a
    // microtask makes preventDefault() too late for forms and <details>.
    result = handler(event);
  } catch (error) {
    reportFailure(error);
    return;
  }

  if (result && typeof result.then === "function") {
    Promise.resolve(result).catch(reportFailure);
  }
}
