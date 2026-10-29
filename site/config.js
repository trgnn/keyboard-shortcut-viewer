/* Keyboard Shortcut Viewer — runtime config.
   Loaded before ksv.js / app.js, exposes plain globals. */

// Conceptual milestone version, mirrored from the current annotated Git tag.
// Scheme: v{major}.{minor} — major = change of direction, minor = functional
// milestone. Source of truth for the version shown in the footer. Bumped
// together with the tag by tools/tag-release.sh — do not edit by hand.
const KSV_VERSION = 'v1.4';

// Earlier versions kept online (newest first), offered by the footer's version menu next to
// the current one. Each is a frozen copy served from its own folder in site/.
const KSV_ARCHIVE = [
  { version: 'v1.0', label: 'first release', href: '/v1.0/' },
  { version: 'v0', label: 'first prototype', href: '/v0/' }
];
