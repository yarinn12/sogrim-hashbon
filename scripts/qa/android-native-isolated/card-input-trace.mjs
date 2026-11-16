// QA-only, bounded producer/consumer clocks. No product text, IDs or persistence.
export function installCardInputTrace() {
  const key = '__qaCardInputTrace';
  if (globalThis[key]) return;
  const records = globalThis[key] = [];
  const actions = new Set(['open-event', 'event-status-select']);
  const menuActions = new Set(['toggle-personal-event-pin', 'share-event-from-list', 'toggle-personal-event-archive', 'remove-event-from-list', 'cancel-event-status-menu']);
  let cardPointer = null;
  for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'contextmenu', 'click']) {
    window.addEventListener(type, event => {
      const action = event.target?.closest?.('[data-action]')?.dataset.action;
      if (type === 'pointerdown' && event.isPrimary !== false) cardPointer = actions.has(action) ? {id: event.pointerId, action} : null;
      const relatedRelease = (type === 'pointerup' || type === 'pointercancel') && cardPointer?.id === event.pointerId;
      const relatedMenuClick = type === 'click' && cardPointer && menuActions.has(action);
      if (!actions.has(action) && !relatedRelease && !relatedMenuClick) return;
      if (records.length >= 32) return;
      records.push({
        type,
        eventTimeStamp: Number.isFinite(event.timeStamp) ? event.timeStamp : null,
        processedAt: performance.now(),
        timeOrigin: performance.timeOrigin,
        pointerId: Number.isFinite(event.pointerId) ? event.pointerId : null,
        pointerType: ['touch', 'mouse', 'pen', ''].includes(event.pointerType) ? event.pointerType : '',
        action: actions.has(action) || menuActions.has(action) ? action : cardPointer.action,
        menuVisible: Boolean(document.querySelector('.event-status-menu'))
      });
    }, {capture: true, passive: true});
  }
}

export const cardInputTraceInstallExpression = `(${installCardInputTrace.toString()})()`;
