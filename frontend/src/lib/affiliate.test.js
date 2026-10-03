import { test } from "node:test";
import assert from "node:assert/strict";
import { getAffiliateOffer } from "./affiliate.js";

test("hides the affiliate offer unless both values are configured", () => {
  assert.equal(getAffiliateOffer("", "https://partner.example/"), null);
  assert.equal(getAffiliateOffer("Partner", ""), null);
  assert.equal(getAffiliateOffer(undefined, undefined), null);
});
test("accepts an owner-configured HTTPS referral with an honest label", () => {
  assert.deepEqual(getAffiliateOffer("Paper Tools", "https://partner.example/ref?id=paperrose"), {
    name: "Paper Tools", url: "https://partner.example/ref?id=paperrose",
  });
});
test("rejects executable and ambiguous affiliate destinations", () => {
  for (const url of ["javascript:alert(1)", "http://partner.example/", "//partner.example/path", "https://localhost/", "https://paperrose.vercel.app/", "https://user:pass@partner.example/"]) {
    assert.equal(getAffiliateOffer("Partner", url), null, url);
  }
  assert.equal(getAffiliateOffer("x".repeat(49), "https://partner.example/"), null);
});
