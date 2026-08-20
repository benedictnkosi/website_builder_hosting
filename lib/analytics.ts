"use client";

import {
  getAnalytics,
  initializeAnalytics,
  isSupported,
  logEvent,
  setUserId,
  type Analytics,
} from "firebase/analytics";
import { getFirebaseApp, isFirebaseClientConfigured } from "@/lib/firebase";
import { ANNUAL_PLAN_ZAR, EDIT_TOPUP_ZAR } from "@/lib/pricing";

type EventParams = Record<string, string | number | boolean | undefined>;

let analyticsPromise: Promise<Analytics | null> | null = null;

function getClientAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  if (!analyticsPromise) {
    analyticsPromise = isSupported()
      .then((supported) => {
        if (!supported || !isFirebaseClientConfigured()) return null;
        const app = getFirebaseApp();
        try {
          return initializeAnalytics(app, {
            config: { send_page_view: false },
          });
        } catch {
          return getAnalytics(app);
        }
      })
      .catch(() => null);
  }

  return analyticsPromise;
}

export function trackEvent(name: string, params?: EventParams) {
  void getClientAnalytics().then((analytics) => {
    if (!analytics) return;
    logEvent(analytics, name, params);
  });
}

export function identifyAnalyticsUser(uid: string | null) {
  void getClientAnalytics().then((analytics) => {
    if (!analytics) return;
    setUserId(analytics, uid);
  });
}

export function trackPageView(path: string) {
  trackEvent("page_view", {
    page_path: path,
    page_location: typeof window !== "undefined" ? window.location.href : path,
    page_title: typeof document !== "undefined" ? document.title : undefined,
  });
}

export function trackLogin(isNewUser: boolean) {
  trackEvent(isNewUser ? "sign_up" : "login", { method: "Google" });
}

export function trackLoginFailed(errorCode: string) {
  trackEvent("login_failed", { method: "Google", error_code: errorCode });
}

export function trackLogout() {
  trackEvent("logout");
}

export function trackStartBuilder(source: string) {
  trackEvent("start_builder", { source });
}

export function trackIntakeStart() {
  trackEvent("intake_start");
}

export function trackIntakeComplete() {
  trackEvent("intake_complete");
}

export function trackAddressChoice(hasAddress: boolean) {
  trackEvent(hasAddress ? "address_submit" : "address_skip");
}

export function trackGenerateStart() {
  trackEvent("generate_website");
}

export function trackGenerateSuccess(websiteId: string) {
  trackEvent("generate_website_success", { website_id: websiteId });
}

export function trackGenerateFail() {
  trackEvent("generate_website_fail");
}

export function trackPaywallView(websiteId: string) {
  trackEvent("paywall_view", { website_id: websiteId });
}

export function trackBeginCheckout(domain: string, amountZar: number) {
  trackEvent("begin_checkout", {
    currency: "ZAR",
    value: amountZar,
    domain,
  });
}

export function trackPurchase(domain: string, amountZar?: number) {
  trackEvent("purchase", {
    currency: "ZAR",
    value: amountZar ?? ANNUAL_PLAN_ZAR,
    domain,
  });
}

export function trackEditTopupStart(amountZar = EDIT_TOPUP_ZAR) {
  trackEvent("begin_checkout", {
    currency: "ZAR",
    value: amountZar,
    item_name: "edits",
  });
}

export function trackEditTopupSuccess(amountZar = EDIT_TOPUP_ZAR) {
  trackEvent("purchase", {
    currency: "ZAR",
    value: amountZar,
    item_name: "edits",
  });
}

export function trackCheckoutCancel() {
  trackEvent("checkout_cancel");
}

export function trackEditStart() {
  trackEvent("edit_website");
}

export function trackEditSuccess() {
  trackEvent("edit_website_success");
}

export function trackDeployStart(domain: string) {
  trackEvent("deploy_website", { domain });
}

export function trackDeploySuccess(domain: string) {
  trackEvent("deploy_website_success", { domain });
}

export function trackDeployFail() {
  trackEvent("deploy_website_fail");
}

export function trackOpenSite() {
  trackEvent("select_content", { content_type: "website" });
}

export function trackCancelSubscription() {
  trackEvent("cancel_subscription");
}

export function trackDeleteWebsite() {
  trackEvent("delete_website");
}

export function trackSupportSubmit() {
  trackEvent("support_submit");
}
