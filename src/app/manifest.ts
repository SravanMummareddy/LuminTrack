import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LuminTrack",
    short_name: "LuminTrack",
    description: "Internal recruitment tracking dashboard",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
