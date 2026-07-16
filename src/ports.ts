// Single source of truth for the host port. Distinct from vibesense's 48753 so
// the two tools can run side by side (see hooks-install.ts for the hook-marker
// half of that coexistence).

export const HOST_PORT = 48762
export const HOST_URL = `http://127.0.0.1:${HOST_PORT}`

// Hook path segment. Deliberately NOT `/hook/`: vibesense's Claude installer
// purges any settings.json entry whose command contains the bare substring
// `/hook/`, which would eat our entries. `/om-hook/` sidesteps that matcher
// while still giving us a full-URL marker of our own. See hooks-install.ts.
export const HOOK_PATH = '/om-hook/'
export const HOOK_URL = `${HOST_URL}${HOOK_PATH}`
