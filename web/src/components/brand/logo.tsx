import { cn } from "@/lib/utils";

type LogoVariant = "horizontal" | "stacked" | "mark";

type LogoProps = {
  variant?: LogoVariant;
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  ariaLabel?: string;
};

/**
 * Triplane PLACEHOLDER mark — three stacked parallelograms with an amber
 * placeholder dot. The dot is the visible "still using template defaults"
 * signal and is intentionally outside the design-token system.
 *
 * Geometry mirrors `mobile/branding/generate-app-icons.ts`. When `/init-app`
 * runs the brand swap, replace the paths AND remove the amber dot.
 */
export function TriplaneMark({
  className,
  ariaLabel,
}: {
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <svg
      viewBox="-8 -8 80 80"
      fill="none"
      role={ariaLabel ? "img" : "presentation"}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      className={cn("text-foreground", className)}
    >
      {/* Plane 3 (top / back) — manually skewed, top edge shifted right by 8*tan(12°) ≈ 1.7 */}
      <path d="M 15.7 14 L 51.7 14 L 50 22 L 14 22 Z" fill="currentColor" />
      {/* Plane 2 (middle) */}
      <path d="M 11.7 28 L 47.7 28 L 46 36 L 10 36 Z" fill="currentColor" />
      {/* Plane 1 (front / bottom) */}
      <path d="M 7.7 42 L 43.7 42 L 42 50 L 6 50 Z" fill="currentColor" />
      {/* PLACEHOLDER amber dot — remove during /init-app brand swap. */}
      <circle cx="51" cy="18" r="2.6" fill="#F59E0B" />
    </svg>
  );
}

export function TriplaneWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-sans lowercase tracking-tight leading-[0.9]",
        className,
      )}
    >
      triplane<span className="text-amber-500">.</span>
    </span>
  );
}

export function Logo({
  variant = "horizontal",
  className,
  markClassName,
  wordmarkClassName,
  ariaLabel = "Triplane",
}: LogoProps) {
  if (variant === "mark") {
    return (
      <TriplaneMark
        ariaLabel={ariaLabel}
        className={cn("h-[1em] w-[1em]", markClassName, className)}
      />
    );
  }

  if (variant === "stacked") {
    return (
      <span
        className={cn(
          "inline-flex flex-col items-center gap-[0.25em]",
          className,
        )}
        aria-label={ariaLabel}
        role="img"
      >
        <TriplaneMark className={cn("h-[1em] w-[1em]", markClassName)} />
        <TriplaneWordmark
          className={cn("text-[0.64em]", wordmarkClassName)}
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.3em] leading-none",
        className,
      )}
      aria-label={ariaLabel}
      role="img"
    >
      <TriplaneMark
        className={cn("h-[1em] w-[1em] shrink-0", markClassName)}
      />
      <TriplaneWordmark
        className={cn("text-[0.64em]", wordmarkClassName)}
      />
    </span>
  );
}
