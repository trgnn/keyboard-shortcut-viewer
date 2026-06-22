# Keyboard Shortcut Viewer

Pick keys on a Mac keyboard and export a clean keycap image of the shortcut.

## Run
Open `index.html` in a browser — that's it. No build step, no framework, no dependencies. The only network request is the Google Fonts stylesheet (Inter + JetBrains Mono); it works offline too, just with fallback fonts.

To avoid `file://` quirks you can serve the folder instead:

```sh
python3 -m http.server 8123
# then open http://127.0.0.1:8123/
```

## Files
| File | Role |
|------|------|
| `index.html` | Entry point. Static markup for the app, loads `styles.css`, `ksv.js`, `app.js`. |
| `ksv.js` | Framework-agnostic keyboard engine on `window.KSV`: key data, interactive render, selection logic, the keycap-chip preview, and all exporters (PNG/JPG/WebP raster, SVG vector, full-keyboard render). |
| `app.js` | Vanilla UI shell: selection/UI state, the segmented controls, accent, the live export preview, and download wiring. |
| `styles.css` | All styling. Sections: shared keyboard/chips, `.opt-d` (the app), preview backgrounds, static board preview. |

## Key concepts (in `ksv.js`)
- **`state.sel`** — `Set` of selected key codes. Modifiers (`MODS`) stack; one non-modifier "activation" key at a time; max 4 logical modifiers.
- **`state.lr`** — "distinguish L/R". Off: left/right modifiers are linked (one logical key). On: independent, with a left/right sub-label.
- **`state.hyper`** — Caps Lock remapped to a hyperkey (`⌃⌥⌘` or `⇧⌃⌥⌘`); pressing it locks out the component modifiers.
- **`state.dbl`** — double-tap shortcut (double-click a modifier). Standalone: can't combine with another double-tap or an activation key. Caps/hyper excluded.
- **`KSV.caps(state)`** → ordered keycap list used by both the live preview and every exporter, so preview and export always match.

## Conventions
- Accent color drives the whole UI via the `--accent` CSS var; `fgFor()` in `app.js` picks legible on-accent text by WCAG contrast.
- SVG export is always transparent regardless of the chosen background.
- The cursor-glow grid lives at the frame root (`.frame-grid` + `.grid-lit`) so it shows behind both the keyboard case and the floating export rail.

## Shortcuts
- **Click** a key to toggle it · **double-click** a modifier for a double-tap shortcut.
- **⇧R** clear keys · **⇧L** change layout · **⇧D** download.
