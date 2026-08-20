import Script from "next/script";
import { GA_MEASUREMENT_ID, GOOGLE_ADS_ID, GOOGLE_TAG_ID } from "@/lib/gtag";

export default function GoogleTag() {
  if (!GOOGLE_TAG_ID) return null;

  const configCalls = [
    GA_MEASUREMENT_ID
      ? `gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });`
      : "",
    GOOGLE_ADS_ID ? `gtag('config', '${GOOGLE_ADS_ID}');` : "",
  ]
    .filter(Boolean)
    .join("\n        ");

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_TAG_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-gtag" strategy="afterInteractive">
        {`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        ${configCalls}
      `}
      </Script>
    </>
  );
}
