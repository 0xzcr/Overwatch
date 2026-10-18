import { ImageResponse } from "next/og";

export const alt = "Overwatch — Know who can move your money";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The social card for every page: the name, the promise, and what it watches. */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: "#000",
        color: "#f7efef",
        fontFamily: "sans-serif",
        borderBottom: "8px solid #ff1f3d",
      }}
    >
      <div style={{ display: "flex", fontSize: 30, letterSpacing: 8, color: "#ff1f3d" }}>OVERWATCH</div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1, letterSpacing: -2 }}>THE PROTOCOL</div>
        <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1, letterSpacing: -2, color: "#ff1f3d" }}>
          WATCHDOG
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 30, color: "#b8a3a3", maxWidth: 980 }}>
        Who can change the Solana protocols holding your deposits — upgrade keys, multisigs, timelocks, durable nonces.
      </div>
    </div>,
    size,
  );
}
