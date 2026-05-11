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
            "radial-gradient(circle at 20% 20%, rgba(34,211,238,0.22), transparent 32%), radial-gradient(circle at 82% 18%, rgba(99,102,241,0.22), transparent 30%), radial-gradient(circle at 50% 100%, rgba(245,158,11,0.14), transparent 34%), #070b16",
          color: "white",
          padding: "58px",
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
            padding: "54px",
            background: "rgba(255,255,255,0.045)",
            boxShadow: "0 30px 120px rgba(0,0,0,0.55)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "18px",
              }}
            >
              <div
                style={{
                  width: "70px",
                  height: "70px",
                  borderRadius: "24px",
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(255,255,255,0.06)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "34px",
                }}
              >
                ✦
              </div>

              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: "34px", fontWeight: 800 }}>
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
                  Premium Trading Intelligence
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
                fontWeight: 700,
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
                fontSize: "74px",
                lineHeight: 1.02,
                fontWeight: 850,
                letterSpacing: "-0.055em",
              }}
            >
              Turn market noise into a personal trading edge.
            </div>

            <div
              style={{
                marginTop: "30px",
                maxWidth: "920px",
                fontSize: "28px",
                lineHeight: 1.42,
                color: "rgba(255,255,255,0.66)",
              }}
            >
              Market intelligence, AI alerts, journal analytics, execution
              review, reports, playbook and coaching in one premium workspace.
            </div>
          </div>

          <div style={{ display: "flex", gap: "14px" }}>
            {[
              "AI Alerts",
              "Journal",
              "Market Intelligence",
              "Execution Coach",
            ].map((item) => (
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
            ))}
          </div>
        </div>
      </div>
    ),
    size
  );
}