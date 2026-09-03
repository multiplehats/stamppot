/**
 * Constants that both the Worker and the React pages need.
 *
 * They sit in their own module because `render.ts` runs inside the Worker,
 * outside the RSC graph — importing them from `site.tsx` would pull React and
 * `@heroui/styles` into a plain text response.
 */
export const REPO_URL = "https://github.com/multiplehats/stamppot";

export const SITE_NAME = "Stamppot";

/** The image OG cards and the `Organization` logo point at. */
export const SOCIAL_IMAGE_PATH = "/stamppot-bowl.png";
