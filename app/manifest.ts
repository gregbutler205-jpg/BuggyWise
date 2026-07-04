import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BuggyWise",
    short_name: "BuggyWise",
    description: "Search smart. Save big. Compare grocery prices across your local stores.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#62a830",
    icons: [192, 256, 384, 512].map((size) => ({
      src: `/icons/icon-${size}.png`,
      sizes: `${size}x${size}`,
      type: "image/png",
    })),
  };
}
