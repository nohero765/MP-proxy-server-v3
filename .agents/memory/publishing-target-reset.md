---
name: Publishing target reset
description: Replit publishing can overwrite the workspace deployment target during a failed or default publish attempt.
---

The Loon service must use an always-running target when available. A publish attempt can rewrite the root deployment target to `cloudrun`, even after a validated workspace edit set it to `vm`; the deployment pane's target selection is authoritative for the next publish. Any configured startup health URL must bypass dashboard authentication.

**Why:** The service depends on persistent WebSocket connections, in-memory session/activity state, and a long-running Go subprocess. The generic “Publishing stopped without reporting an outcome” state can occur before any deployment build record is created when the target selection is not settled or the publisher's unauthenticated startup probe receives 401.

**How to apply:** Before retrying Publish, use the available always-on target or the standard Free-compatible target, remove unnecessary root pre-build hooks, and verify the configured health path returns 200 without cookies while protected application routes still require authentication.