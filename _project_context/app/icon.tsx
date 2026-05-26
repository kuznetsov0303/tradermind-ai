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
            "radial-gradient(circle at 28% 18%, rgba(34,211,238,0.42), transparent 36%), radial-gradient(circle at 78% 82%, rgba(99,102,241,0.36), transparent 40%), linear-gradient(135deg, rgba(255,255,255,0.10), transparent 48%), #08111f",
          borderRadius: "18px",
          border: "1px solid rgba(34,211,238,0.38)",
          color: "white",
          fontFamily: "Arial, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "-12px",
            top: "31px",
            width: "88px",
            height: "1px",
            background:
              "linear-gradient(90deg, transparent, rgba(207,250,254,0.72), transparent)",
            transform: "rotate(-45deg)",
          }}
        />

        <div
          style={{
            position: "absolute",
            right: "9px",
            top: "9px",
            width: "6px",
            height: "6px",
            borderRadius: "999px",
            background: "rgb(103,232,249)",
            boxShadow: "0 0 12px rgba(103,232,249,0.95)",
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "1px",
            fontSize: "18px",
            fontWeight: 900,
            letterSpacing: "-0.11em",
          }}
        >
          <span>S</span>
          <span style={{ color: "rgb(207,250,254)" }}>E</span>
          <span
            style={{
              marginLeft: "2px",
              fontSize: "10px",
              letterSpacing: "-0.04em",
              color: "rgba(255,255,255,0.62)",
            }}
          >
            AI
          </span>
        </div>
      </div>
    ),
    size
  );
}