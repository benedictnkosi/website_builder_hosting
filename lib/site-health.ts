import "server-only";

const CHECK_TIMEOUT_MS = 8000;

export type LiveSiteStatus = {
  ready: boolean;
  status: number | null;
  url: string | null;
};

function liveUrls(domain: string): string[] {
  const host = domain.trim().toLowerCase().replace(/\.$/, "");
  return [`https://${host}/`];
}

async function probeUrl(url: string): Promise<number | null> {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent": "Lulaweb-Publish-Check/1.0",
      },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    return response.status;
  } catch {
    return null;
  }
}

export async function checkLiveSite(domain: string): Promise<LiveSiteStatus> {
  for (const url of liveUrls(domain)) {
    const status = await probeUrl(url);
    if (status === 200) {
      return { ready: true, status, url };
    }
  }

  return { ready: false, status: null, url: null };
}
