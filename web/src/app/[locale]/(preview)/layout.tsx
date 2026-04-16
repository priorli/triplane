/**
 * Minimal layout for the forge's design-preview iframe. Deliberately skips
 * the `(tools)` header/nav so the preview shows ONLY the worktree's applied
 * design tokens — no forge chrome competing with the user's brand. The parent
 * `[locale]/layout.tsx` still provides the i18n + theme providers.
 */
export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-full p-6">{children}</div>;
}
