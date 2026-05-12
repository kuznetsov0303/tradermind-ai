import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleAppIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "180px",
          height: "180px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at 30% 20%, rgba(34,211,238,0.38), transparent 38%), radial-gradient(circle at 75% 80%, rgba(99,102,241,0.35), transparent 40%), #08111f",
          borderRadius: "44px",
          border: "2px solid rgba(34,211,238,0.34)",
          color: "white",
          fontSize: "52px",
          fontWeight: 800,
          letterSpacing: "-0.08em",
          fontFamily: "Arial, sans-serif",
        }}
      >
        SE
      </div>
    ),
    size
  );
}