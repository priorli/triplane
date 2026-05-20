# Triplane branding (placeholder)

Generates the iOS app icon and launch logo PNGs from a single SVG template
inlined in `generate-app-icons.ts`. Android assets are vector drawables
(no PNG generation).

## Placeholder convention

Triplane is a template. Every rendered asset includes a small **amber
`#F59E0B` dot** as the visible "I am still the template default" signal.
A downstream project that ships the placeholder ships the visible warning.

`/init-app`'s brand-swap follow-up regenerates assets from the downstream
project's mark and removes the amber dot. If you see the amber dot in a
shipping build, the brand swap was skipped.

## Regen

```bash
cd mobile/branding
bun install
bun run generate-app-icons.ts
```

This writes:
- `mobile/iosApp/iosApp/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png`
- `mobile/iosApp/iosApp/Assets.xcassets/LaunchLogo.imageset/LaunchLogo@{1,2,3}x.png`

If Xcode doesn't pick up changes, Product → Clean Build Folder.

## File checklist for `/init-app` brand swap

When swapping the placeholder for a downstream brand, replace these files
together (skipping any one leaves a hybrid that ships with the amber dot
visible somewhere):

### Source-of-truth + generator
- `mobile/branding/generate-app-icons.ts` — replace the mark geometry block
  (`markGroup()`, `PLANES`, `AMBER` constant). **Drop the amber dot entirely**
  — that's the placeholder signal, not part of the brand schema.

### Mobile (iOS)
- `mobile/iosApp/iosApp/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png` (regenerated)
- `mobile/iosApp/iosApp/Assets.xcassets/LaunchLogo.imageset/LaunchLogo@{1,2,3}x.png` (regenerated)
- `mobile/iosApp/iosApp/Assets.xcassets/LaunchBackground.colorset/Contents.json`
- `mobile/iosApp/iosApp/Assets.xcassets/AccentColor.colorset/Contents.json`

### Mobile (Android)
- `mobile/composeApp/src/androidMain/res/drawable/ic_launcher_foreground.xml`
- `mobile/composeApp/src/androidMain/res/drawable/ic_launcher_monochrome.xml`
- `mobile/composeApp/src/androidMain/res/values/colors.xml`

### Mobile (Compose splash)
- `mobile/composeApp/src/commonMain/kotlin/com/priorli/triplane/feature/splash/SplashOverlay.kt`

### Web
- `web/src/components/brand/logo.tsx`
- `web/src/app/icon.tsx`
- `web/src/app/apple-icon.tsx`
- `web/src/app/opengraph-image.tsx`

## Why amber, why outside the token system?

`design/tokens.json` defines the *shipping* brand. The amber dot is not part
of the brand — it's a debug-time signal that the brand has not been
configured for this downstream. Putting it in `tokens.json` would make it
look like a legitimate brand color and risk it leaking into production.
The hardcoded literal `#F59E0B` in this generator (and parallel files
listed above) is intentional. Do not extract it into a token.
