import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// Browser tab icon and PWA manifest icon. Rounded indigo square with a white "L".
export default function Icon() {
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
          fontSize: 340,
          fontWeight: 700,
          borderRadius: 96,
        }}
      >
        L
      </div>
    ),
    { ...size },
  );
}
