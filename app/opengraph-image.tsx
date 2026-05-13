import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "SkillEdge AI — Premium AI Trading Workspace";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at 18% 18%, rgba(34,211,238,0.23), transparent 32%), radial-gradient(circle at 84% 18%, rgba(99,102,241,0.22), transparent 31%), radial-gradient(circle at 54% 110%, rgba(16,185,129,0.14), transparent 34%), #070b16",
          color: "white",
          padding: "56px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            border: "1px solid rgba(255,255,255,0.13)",
            borderRadius: "44px",
            padding: "52px",
            background: "rgba(255,255,255,0.045)",
            boxShadow: "0 30px 120px rgba(0,0,0,0.56)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
              <div
                style={{
                  width: "72px",
                  height: "72px",
                  borderRadius: "24px",
                  border: "1px solid rgba(34,211,238,0.36)",
                  background:
                    "radial-gradient(circle at 28% 18%, rgba(34,211,238,0.36), transparent 36%), radial-gradient(circle at 78% 82%, rgba(99,102,241,0.30), transparent 40%), #08111f",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "22px",
                  fontWeight: 900,
                  letterSpacing: "-0.11em",
                  color: "white",
                  boxShadow: "0 0 38px rgba(34,211,238,0.18)",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: "-18px",
                    top: "35px",
                    width: "108px",
                    height: "1px",
                    background:
                      "linear-gradient(90deg, transparent, rgba(207,250,254,0.75), transparent)",
                    transform: "rotate(-45deg)",
                  }}
                />

                <div
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "10px",
                    width: "7px",
                    height: "7px",
                    borderRadius: "999px",
                    background: "rgb(103,232,249)",
                    boxShadow: "0 0 14px rgba(103,232,249,0.95)",
                  }}
                />

                <div style={{ display: "flex", alignItems: "baseline" }}>
                  <span>S</span>
                  <span style={{ color: "rgb(207,250,254)" }}>E</span>
                  <span
                    style={{
                      marginLeft: "3px",
                      fontSize: "12px",
                      letterSpacing: "-0.04em",
                      color: "rgba(255,255,255,0.62)",
                    }}
                  >
                    AI
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: "34px", fontWeight: 850 }}>
                  SkillEdge AI
                </div>
                <div
                  style={{
                    marginTop: "8px",
                    fontSize: "15px",
                    letterSpacing: "0.28em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.48)",
                  }}
                >
                  Premium Trading Workspace
                </div>
              </div>
            </div>

            <div
              style={{
                height: "42px",
                padding: "0 22px",
                borderRadius: "999px",
                border: "1px solid rgba(34,211,238,0.35)",
                background: "rgba(34,211,238,0.12)",
                color: "rgba(207,250,254,0.96)",
                fontSize: "17px",
                fontWeight: 750,
                display: "flex",
                alignItems: "center",
              }}
            >
              AI Trading Desk
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                maxWidth: "980px",
                fontSize: "72px",
                lineHeight: 1.03,
                fontWeight: 900,
                letterSpacing: "-0.058em",
              }}
            >
              Structure, review and market intelligence for serious traders.
            </div>

            <div
              style={{
                marginTop: "28px",
                maxWidth: "920px",
                fontSize: "27px",
                lineHeight: 1.42,
                color: "rgba(255,255,255,0.66)",
              }}
            >
              Journal analytics, AI signals, market scanner, execution review,
              reports, playbook and coaching in one connected workspace.
            </div>
          </div>

          <div style={{ display: "flex", gap: "14px" }}>
            {["Journal", "Market Intelligence", "AI Signals", "Reports"].map(
              (item) => (
                <div
                  key={item}
                  style={{
                    padding: "12px 18px",
                    borderRadius: "999px",
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(0,0,0,0.24)",
                    color: "rgba(255,255,255,0.72)",
                    fontSize: "18px",
                    fontWeight: 700,
                  }}
                >
                  {item}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    ),
    size
  );
}