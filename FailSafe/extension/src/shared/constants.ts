// Canonical FailSafe Pro URLs. Two distinct roles:
//
//   - FAILSAFE_PRO_ABOUT_URL: the learn-more / product page. The extension UI
//     and command palette ALWAYS open this URL. The page itself hosts the
//     Download button — that is the canonical action surface for getting Pro.
//
//   - FAILSAFE_PRO_DOWNLOAD_URL: the direct download route. Kept as a constant
//     for drift-guard tests and external linking. NO extension UI surface
//     opens this URL directly.
//
// If either route changes upstream, fix it via a website redirect — never
// scatter URLs across the codebase.
export const FAILSAFE_PRO_ABOUT_URL = "https://mythologiq.studio/products/failsafe-pro";
export const FAILSAFE_PRO_DOWNLOAD_URL = "https://mythologiq.studio/products/failsafe-download";
