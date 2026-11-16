// Browser-only fixture control. This deliberately replaces the whole summary
// root; a notice may legitimately preserve that root and its navigation.
export function replaceClosedSummaryScreen(documentRoot=document) {
 const selector='.settlement-screen[data-event-view="summary"]';
 const previous=documentRoot.querySelector(selector);
 if(!previous?.isConnected)throw new Error('Controlled summary replacement requires a connected screen');
 const replacement=previous.cloneNode(true);
 previous.replaceWith(replacement);
 const current=documentRoot.querySelector(selector);
 if(current!==replacement||previous.isConnected||!replacement.isConnected)throw new Error('Controlled summary fixture did not replace the screen');
 return {replaced:current!==previous,previousConnected:previous.isConnected,currentConnected:current.isConnected,sameMarkup:previous.innerHTML===current.innerHTML};
}
