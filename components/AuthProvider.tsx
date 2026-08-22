"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getAdditionalUserInfo,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import {
  getFirebaseAuth,
  getGoogleProvider,
  isFirebaseClientConfigured,
} from "@/lib/firebase";
import { clearBuilderSession } from "@/lib/builder-session";
import { GUEST_ID_HEADER } from "@/lib/guest";
import {
  ensureLocalCredits,
  getGuestSyncPayload,
  getOrCreateGuestId,
  markGuestSynced,
  startFreshGuestSession,
} from "@/lib/guest-session";
import { applyMockAiHeaders, syncMockAiPreferenceFromUrl } from "@/lib/mock-ai-preference";
import { notifyEditsChanged } from "@/lib/edit-events";
import { trackLogin, trackLoginFailed, trackLogout } from "@/lib/analytics";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<boolean>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  authFetch: (input: string, init?: RequestInit) => Promise<Response>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function syncSessionCookie(user: User | null) {
  if (!user) {
    await fetch("/api/session", { method: "DELETE" });
    return;
  }

  const token = await user.getIdToken();
  const guest = getGuestSyncPayload();
  const response = await fetch("/api/session", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(guest),
  });
  if (response.ok && !guest.synced) {
    markGuestSynced();
    notifyEditsChanged();
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    syncMockAiPreferenceFromUrl();
  }, []);

  useEffect(() => {
    if (!isFirebaseClientConfigured()) {
      ensureLocalCredits();
      setLoading(false);
      return;
    }

    try {
      const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (nextUser) => {
        void (async () => {
          try {
            await syncSessionCookie(nextUser);
          } catch {
            // Cookie sync failure still leaves Bearer auth available.
          } finally {
            setUser(nextUser);
            setLoading(false);
          }
        })();
      });

      return unsubscribe;
    } catch {
      setLoading(false);
      return;
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      ensureLocalCredits();
    }
  }, [loading, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async signInWithGoogle() {
        try {
          const result = await signInWithPopup(
            getFirebaseAuth(),
            getGoogleProvider(),
          );
          const isNewUser = Boolean(getAdditionalUserInfo(result)?.isNewUser);
          trackLogin(isNewUser);
          await syncSessionCookie(result.user);
          return isNewUser;
        } catch (err) {
          const code =
            typeof err === "object" && err && "code" in err
              ? String(err.code)
              : "unknown";
          if (
            code !== "auth/popup-closed-by-user" &&
            code !== "auth/cancelled-popup-request"
          ) {
            trackLoginFailed(code);
          }
          throw err;
        }
      },
      async signOut() {
        trackLogout();
        clearBuilderSession();
        await syncSessionCookie(null);
        await firebaseSignOut(getFirebaseAuth());
        startFreshGuestSession();
      },
      async getIdToken() {
        if (user) return user.getIdToken();
        if (!isFirebaseClientConfigured()) return null;
        const current = getFirebaseAuth().currentUser;
        return current ? current.getIdToken() : null;
      },
      async authFetch(input, init = {}) {
        let token: string | null = null;
        try {
          if (user) {
            token = await user.getIdToken();
          } else if (isFirebaseClientConfigured()) {
            const current = getFirebaseAuth().currentUser;
            token = current ? await current.getIdToken() : null;
          }
        } catch {
          token = null;
        }

        const headers = new Headers(init.headers);
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }
        headers.set(GUEST_ID_HEADER, getOrCreateGuestId());
        applyMockAiHeaders(headers);
        if (init.body && !headers.has("Content-Type")) {
          headers.set("Content-Type", "application/json");
        }

        return fetch(input, { ...init, headers });
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
