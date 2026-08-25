import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SUBSCRIPTION_PLAN_ZAR } from "@/lib/pricing";

export const alt = `Lulaweb — AI website builder for South African businesses. Design, a .co.za domain, and hosting from R${SUBSCRIPTION_PLAN_ZAR} a month.`;
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  const logo = await readFile(join(process.cwd(), "public/logo.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

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
          <img src={logoSrc} width={56} height={56} alt="" />
          <div style={{ display: "flex", fontSize: 32, fontWeight: 600 }}>
            Lulaweb
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              display: "flex",
              fontSize: 64,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              maxWidth: 960,
            }}
          >
            AI website builder for South African businesses
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              color: "#44403c",
              maxWidth: 820,
            }}
          >
            {`Chat about your business. Design, a .co.za domain, and hosting from R${SUBSCRIPTION_PLAN_ZAR}/month.`}
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
          <span>Website design</span>
          <span>·</span>
          <span>.co.za domain</span>
          <span>·</span>
          <span>Hosting included</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
