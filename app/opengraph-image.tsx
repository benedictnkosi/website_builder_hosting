import { ImageResponse } from "next/og";
import { MONTHLY_SUBSCRIPTION_ZAR } from "@/lib/pricing";

export const alt =
  "Lulaweb — AI website builder for South African businesses. Get a .co.za website from R19 a month.";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f3efe6",
          padding: "72px 80px",
          color: "#1c1917",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "#115e59",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            L
          </div>
          <div style={{ fontSize: 32, fontWeight: 600 }}>Lulaweb</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              maxWidth: 960,
            }}
          >
            AI website builder for South African businesses
          </div>
          <div style={{ fontSize: 28, color: "#44403c", maxWidth: 820 }}>
            Chat about your business. Get a live website and a .co.za domain
            from R{MONTHLY_SUBSCRIPTION_ZAR}/month.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 16,
            fontSize: 22,
            color: "#115e59",
            fontWeight: 600,
          }}
        >
          <span>Free preview</span>
          <span>·</span>
          <span>.co.za hosting</span>
          <span>·</span>
          <span>WhatsApp + call buttons</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
