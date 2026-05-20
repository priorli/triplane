import { ImageResponse } from "next/og";

// Apple touch icon — 180×180, opaque white background. Three-parallelogram
// mark + amber placeholder dot. Apple's iOS auto-rounds the corners.

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          viewBox="-8 -8 80 80"
          width="140"
          height="140"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M 15.7 14 L 51.7 14 L 50 22 L 14 22 Z" fill="#343434" />
          <path d="M 11.7 28 L 47.7 28 L 46 36 L 10 36 Z" fill="#343434" />
          <path d="M 7.7 42 L 43.7 42 L 42 50 L 6 50 Z" fill="#343434" />
          {/* PLACEHOLDER amber — remove during /init-app brand swap. */}
          <circle cx="51" cy="18" r="2.6" fill="#F59E0B" />
        </svg>
      </div>
    ),
    size,
  );
}
