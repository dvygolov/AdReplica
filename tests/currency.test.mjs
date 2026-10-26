import assert from "node:assert/strict";
import { test } from "node:test";
import {
  convertBudgets,
  normalizeCurrency,
  withConvertedBudgets,
} from "../src/domain/currency.mjs";

function pkg() {
  return {
    campaign: { name: "C", daily_budget: 5000 },
    adsets: [
      { name: "A1", daily_budget: 2000, lifetime_budget: 100000 },
      { name: "A2", bid_amount: 150 },
    ],
  };
}

test("currencies are normalized and rejected when malformed", () => {
  assert.equal(normalizeCurrency(" usd "), "USD");
  assert.equal(normalizeCurrency("rub"), "RUB");
  assert.equal(normalizeCurrency(""), "");
  assert.equal(normalizeCurrency("US"), "");
  assert.equal(normalizeCurrency(undefined), "");
});

test("budgets are rescaled in minor units", () => {
  const data = pkg();
  const converted = convertBudgets(data, 2);
  assert.equal(converted, 4);
  assert.equal(data.campaign.daily_budget, 10000);
  assert.equal(data.adsets[0].daily_budget, 4000);
  assert.equal(data.adsets[0].lifetime_budget, 200000);
  assert.equal(data.adsets[1].bid_amount, 300);
});

test("a rate of one leaves the package untouched", () => {
  const data = pkg();
  assert.equal(convertBudgets(data, 1), 0);
  assert.equal(data.campaign.daily_budget, 5000);
});

test("converting a copy never rescales the cached package twice", () => {
  const original = pkg();
  const first = withConvertedBudgets(original, 3);
  assert.notEqual(first, original);
  assert.equal(first.campaign.daily_budget, 15000);
  assert.equal(original.campaign.daily_budget, 5000, "source stays intact");
  const second = withConvertedBudgets(original, 3);
  assert.equal(second.campaign.daily_budget, 15000, "repeat is not cumulative");
});

test("invalid rates are ignored", () => {
  const data = pkg();
  for (const rate of [0, -1, Number.NaN, "abc", null]) {
    assert.equal(convertBudgets(data, rate), 0);
  }
  assert.equal(data.campaign.daily_budget, 5000);
});
