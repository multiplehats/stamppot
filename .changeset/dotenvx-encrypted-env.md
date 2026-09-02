---
---

Manage environment files with dotenvx. The `.env*` files are now committed encrypted, a pre-commit hook refuses to commit plaintext ones, CI decrypts `.env.ci` for its checks, and the production deploy uploads the Worker runtime secrets declared in `.env.production` before it deploys.
