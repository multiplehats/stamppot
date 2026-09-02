---
---

Harden the dotenvx setup after review: decrypted values now override a shadowing shell variable, the deploy refuses to continue unless the Worker secret upload is confirmed, `.dev.vars` generation no longer corrupts values containing quotes or deletes a hand-maintained file, `.gitignore` again ignores stray `.env` files outside the three committed ones, and CI fails rather than silently skipping decryption when the private key is missing on a non-fork run.
