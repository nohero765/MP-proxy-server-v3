---
name: Publishing target reset
description: Replit publishing can overwrite the workspace deployment target during a failed or default publish attempt.
---

The Loon service must be published as Reserved VM. A publish attempt can rewrite the root deployment target to `cloudrun`, even after a validated workspace edit set it to `vm`; the deployment pane's target selection is authoritative for the next publish.

**Why:** The service depends on persistent WebSocket connections, in-memory session/activity state, and a long-running Go subprocess. The generic “Publishing stopped without reporting an outcome” state can occur before any deployment build record is created when the target selection is not settled.

**How to apply:** Before retrying Publish, open Publishing settings, select Reserved VM rather than Autoscale/cloudrun, save the setting, and restart compute if the pane remains stuck. Verify the workspace target is still `vm` after saving.