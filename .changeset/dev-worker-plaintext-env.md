---
---

Keep encrypted values out of the local dev and test Worker. Wrangler reads `.env` files from disk and would otherwise bind `env.<KEY>` to the literal `encrypted:...` ciphertext; it is now told not to, and `pnpm dev` regenerates a gitignored `apps/edge/.dev.vars` holding the decrypted runtime values instead.
