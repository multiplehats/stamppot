---
---

The hosted OV stop directory is now published weekly by a scheduled workflow, and every production deploy checks that `find_ov_stop` answers, so `directory_unavailable` from an empty stops bucket fails CI instead of reaching users.
