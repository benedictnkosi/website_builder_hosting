import assert from "node:assert/strict";
import test from "node:test";
import { parseDomainQuery } from "../lib/domain-name.ts";
import { SUBSCRIPTION_TLD } from "../lib/pricing.ts";

test("the subscription domain extension is always co.za", () => {
  assert.equal(SUBSCRIPTION_TLD, "co.za");
});

test("a full co.za domain is parsed without adding the extension to the name", () => {
  assert.deepEqual(parseDomainQuery("https://www.FreshNest-Cleaning.co.za/", ["co.za"]), {
    sld: "freshnest-cleaning",
    preferredTld: "co.za",
  });
});

test("a bare domain name remains a valid co.za SLD", () => {
  assert.deepEqual(parseDomainQuery("FreshNest Cleaning", ["co.za"]), {
    sld: "freshnest-cleaning",
  });
});
