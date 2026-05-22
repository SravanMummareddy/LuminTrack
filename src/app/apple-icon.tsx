import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS home-screen icon. Full-bleed indigo square — iOS applies its own corner
// mask, so no border radius here.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#4f46e5",
          color: "#ffffff",
          fontSize: 120,
          fontWeight: 700,
        }}
      >
        L
      </div>
    ),
    { ...size },
  );
}
