/// <reference types="astro/client" />

interface ImportMetaEnv {
  /**
   * Which exhibits a build includes (docs/CONTENT_GUIDE.md section 6):
   * production = published only, preview = published + review, development = everything.
   * Unset: `astro dev` is development, `astro build` is production.
   */
  readonly PLCMUSEUM_STAGE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
