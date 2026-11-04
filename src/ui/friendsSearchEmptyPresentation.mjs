// Filtering, roster membership and focus are owned by the existing app adapter.
export function renderFriendsSearchEmptyView() {
  return `<div class="empty-state friends-search-empty friends-search-review" data-friends-search-empty role="status" hidden>
    <strong>לא נמצאו חברים</strong>
    <span>אפשר לנסות שם אחר או לנקות את החיפוש.</span>
    <button type="button" class="secondary-button" data-action="clear-friends-search">ניקוי החיפוש</button>
  </div>`;
}
