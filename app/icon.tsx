import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = {
  width: 64,
  height: 64,
};

export const contentType = "image/png";

export default function AppIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "64px",
          height: "64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at 30% 20%, rgba(34,211,238,0.38), transparent 38%), radial-gradient(circle at 75% 80%, rgba(99,102,241,0.35), transparent 40%), #08111f",
          borderRadius: "18px",
          border: "1px solid rgba(34,211,238,0.34)",
          color: "white",
          fontSize: "20px",
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