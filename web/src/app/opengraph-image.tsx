import { ImageResponse } from "next/og";

// Open Graph / Twitter card — 1200×630. Charcoal mark + "triplane." wordmark
// + tagline + placeholder chip in the bottom-right.
// Used automatically by Next.js for OpenGraph and Twitter card defaults
// when this file is colocated with the route's layout.

export const alt = "Triplane — Priorli's full-stack monorepo template";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#FFFFFF",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "64px",
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
        <svg
          viewBox="-8 -8 80 80"
          width="240"
          height="240"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M 15.7 14 L 51.7 14 L 50 22 L 14 22 Z" fill="#343434" />
          <path d="M 11.7 28 L 47.7 28 L 46 36 L 10 36 Z" fill="#343434" />
          <path d="M 7.7 42 L 43.7 42 L 42 50 L 6 50 Z" fill="#343434" />
          <circle cx="51" cy="18" r="2.6" fill="#F59E0B" />
        </svg>
        <div
          style={{
            marginTop: 32,
            fontSize: 96,
            fontWeight: 600,
            color: "#343434",
            letterSpacing: "-0.02em",
            display: "flex",
          }}
        >
          triplane<span style={{ color: "#F59E0B" }}>.</span>
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 32,
            color: "#737373",
            display: "flex",
          }}
        >
          Priorli&rsquo;s full-stack monorepo template
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 32,
            right: 32,
            padding: "8px 16px",
            border: "2px solid #F59E0B",
            color: "#F59E0B",
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            borderRadius: 4,
            display: "flex",
          }}
        >
          Placeholder brand
        </div>
      </div>
    ),
    size,
  );
}
