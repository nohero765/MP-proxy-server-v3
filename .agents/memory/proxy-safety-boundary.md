---
name: Proxy safety boundary
description: Keep the Loon service limited to Music Presence cover-art traffic and avoid turning it into a general-purpose public proxy.
---

The public WebSocket and image routes are intentional for Music Presence, but external cover-art fetching must remain narrowly validated: HTTP(S) only, no credentials, no obvious private/internal IPs, and bounded response sizes.

**Why:** Replit's Trust and Safety rules prohibit service misuse and excessive-resource apps; an unrestricted relay or URL fetcher could be mistaken for an open proxy even when the intended use is legitimate.

**How to apply:** Preserve the narrow route scope, keep dashboard controls authenticated, and add provider/traffic limits before expanding proxy behavior.