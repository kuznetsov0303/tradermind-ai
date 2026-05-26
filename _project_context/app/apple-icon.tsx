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
            "radial-gradient(circle at 28% 18%, rgba(34,211,238,0.42), transparent 36%), radial-gradient(circle at 78% 82%, rgba(99,102,241,0.36), transparent 42%), linear-gradient(135deg, rgba(255,255,255,0.12), transparent 48%), #08111f",
          borderRadius: "44px",
          border: "2px solid rgba(34,211,238,0.38)",
          color: "white",
          fontFamily: "Arial, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "-35px",
            top: "88px",
            width: "250px",
            height: "2px",
            background:
              "linear-gradient(90deg, transparent, rgba(207,250,254,0.72), transparent)",
            transform: "rotate(-45deg)",
          }}
        />

        <div
          style={{
            position: "absolute",
            right: "28px",
            top: "28px",
            width: "14px",
            height: "14px",
            borderRadius: "999px",
            background: "rgb(103,232,249)",
            boxShadow: "0 0 24px rgba(103,232,249,0.95)",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: "28px",
            bottom: "28px",
            width: "14px",
            height: "14px",
            borderRadius: "999px",
            background: "rgb(110,231,183)",
            boxShadow: "0 0 24px rgba(110,231,183,0.88)",
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "2px",
            fontSize: "48px",
            fontWeight: 900,
            letterSpacing: "-0.11em",
          }}
        >
          <span>S</span>
          <span style={{ color: "rgb(207,250,254)" }}>E</span>
          <span
            style={{
              marginLeft: "5px",
              fontSize: "24px",
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