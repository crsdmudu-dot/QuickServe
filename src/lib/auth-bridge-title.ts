// auth-bridge-title.ts — the one document title the web Auth bridge may ever show.
//
// The bridge pages are opened from emailed links whose URL fragment carries a one-time token hash.
// When a document's <title> is empty, browsers fall back to the full URL — fragment included — for
// the tab label, and that label can reach browser history metadata, screenshots, tab sync and crash
// reports. So the title is a fixed, neutral constant: never derived from the URL, the link state,
// an error or the user.
//
// Deliberately dependency-free: infra/qa-auth-bridge/build.ts imports it directly (plain Node, no
// path aliases) to refuse any bridge build whose prerendered documents do not carry exactly this.

export const AUTH_BRIDGE_DOCUMENT_TITLE = 'KwikServe';
