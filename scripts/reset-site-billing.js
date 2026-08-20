#!/usr/bin/env node
/**
 * Clear a site's subscription and domain so it shows as a draft again.
 *
 *   npm run reset-site-billing -- --list
 *   npm run reset-site-billing -- <websiteId>
 *   npm run reset-site-billing -- --domain test20aug.xyz
 *   npm run reset-site-billing -- --dry-run <websiteId>
 *
 * Uses FIREBASE_SERVICE_ACCOUNT_PATH / secrets/firebase-adminsdk.json from
 * .env.local. Does not cancel PayFast.
 */
const { existsSync, readFileSync, unlinkSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { cert, initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

const ROOT = path.resolve(__dirname, "..");

function printUsage() {
  console.log(`Usage:
  npm run reset-site-billing -- --list
  npm run reset-site-billing -- <websiteId>
  npm run reset-site-billing -- --domain <domain>
  npm run reset-site-billing -- --dry-run <websiteId>

Removes the Firestore subscription and nested domain/status on the site
records, plus local generated-sites/<id>/.subscription.json if present.`);
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = { list: false, dryRun: false, domain: "", websiteId: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--list" || arg === "-l") {
      args.list = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--domain" || arg === "-d") {
      args.domain = String(argv[i + 1] || "")
        .trim()
        .toLowerCase();
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else if (!arg.startsWith("-") && !args.websiteId) {
      args.websiteId = arg.trim();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function loadServiceAccount() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (inline?.startsWith("{")) return JSON.parse(inline);

  const configured =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
    "secrets/firebase-adminsdk.json";
  const resolved = path.isAbsolute(configured)
    ? configured
    : path.join(ROOT, configured);
  if (!existsSync(resolved)) {
    throw new Error(
      `Firebase Admin credentials not found at ${resolved}. Set FIREBASE_SERVICE_ACCOUNT_PATH.`,
    );
  }
  return JSON.parse(readFileSync(resolved, "utf8"));
}

function summarize(data = {}) {
  const subscription = data.subscription || {};
  return {
    websiteId: data.websiteId || "",
    businessName: data.businessName || "",
    ownerEmail: data.ownerEmail || "",
    domain: subscription.domain || null,
    status: subscription.status || null,
    updatedAt: data.updatedAt || "",
  };
}

function printSites(rows) {
  if (rows.length === 0) {
    console.log("No sites found.");
    return;
  }
  const pad = (value, width) => String(value ?? "").padEnd(width);
  console.log(
    `${pad("updatedAt", 25)} ${pad("status", 10)} ${pad("domain", 36)} ${pad("businessName", 28)} websiteId`,
  );
  for (const row of rows) {
    console.log(
      `${pad(row.updatedAt, 25)} ${pad(row.status || "draft", 10)} ${pad(row.domain || "—", 36)} ${pad(row.businessName, 28)} ${row.websiteId}`,
    );
  }
}

function clearLocalCache(websiteId) {
  const siteDir = path.join(ROOT, "generated-sites", websiteId);
  const subscriptionFile = path.join(siteDir, ".subscription.json");
  const metaFile = path.join(siteDir, ".meta.json");
  const actions = [];

  if (existsSync(subscriptionFile)) {
    unlinkSync(subscriptionFile);
    actions.push("deleted generated-sites/.../.subscription.json");
  }
  if (existsSync(metaFile)) {
    const meta = JSON.parse(readFileSync(metaFile, "utf8"));
    if (meta.subscription) {
      delete meta.subscription;
      meta.updatedAt = new Date().toISOString();
      writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
      actions.push("cleared subscription on generated-sites/.../.meta.json");
    }
  }
  return actions;
}

async function resetSite(db, websiteId, { dryRun }) {
  const siteRef = db.collection("sites").doc(websiteId);
  const siteSnap = await siteRef.get();
  if (!siteSnap.exists) {
    throw new Error(`Site not found: ${websiteId}`);
  }

  const site = siteSnap.data() || {};
  const ownerUid = typeof site.ownerUid === "string" ? site.ownerUid : "";
  const before = summarize({ ...site, websiteId });
  const subSnap = await db.collection("subscriptions").doc(websiteId).get();

  console.log("Before:", before);
  if (subSnap.exists && subSnap.get("token")) {
    console.warn(
      "This site has a PayFast token. The script does not cancel PayFast billing.",
    );
  }
  if (dryRun) {
    console.log("Dry run. No changes written.");
    return;
  }

  const now = new Date().toISOString();
  const payload = {
    subscription: FieldValue.delete(),
    updatedAt: now,
  };

  await db.collection("subscriptions").doc(websiteId).delete();
  await siteRef.set(payload, { merge: true });
  if (ownerUid) {
    await db
      .collection("users")
      .doc(ownerUid)
      .collection("sites")
      .doc(websiteId)
      .set(payload, { merge: true });
  }

  const localActions = clearLocalCache(websiteId);
  const afterSite = (await siteRef.get()).data() || {};
  console.log("After:", summarize({ ...afterSite, websiteId }));
  if (localActions.length) console.log("Local:", localActions.join("; "));
}

async function main() {
  loadEnvFile(path.join(ROOT, ".env"));
  loadEnvFile(path.join(ROOT, ".env.local"));

  const args = parseArgs(process.argv.slice(2));
  if (!args.list && !args.websiteId && !args.domain) {
    printUsage();
    process.exit(1);
  }

  const serviceAccount = loadServiceAccount();
  initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
  const db = getFirestore();

  const snapshots = await db.collection("sites").get();
  const sites = snapshots.docs
    .map((doc) => summarize({ websiteId: doc.id, ...doc.data() }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  if (args.list) {
    printSites(sites);
    return;
  }

  let websiteId = args.websiteId;
  if (!websiteId && args.domain) {
    const matches = sites.filter((site) => site.domain === args.domain);
    if (matches.length === 0) {
      throw new Error(`No site found with domain ${args.domain}`);
    }
    if (matches.length > 1) {
      printSites(matches);
      throw new Error("Multiple sites share that domain. Pass a websiteId.");
    }
    websiteId = matches[0].websiteId;
  }

  await resetSite(db, websiteId, { dryRun: args.dryRun });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
