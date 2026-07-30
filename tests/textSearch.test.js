import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SEARCH_MIN_CPF_DIGITS,
  buildTextSearchCondition,
} from "../src/services/db/sql.js";

// Unit-level on purpose. The generated SQL can't be exercised against the
// DuckDB build used by this suite: the node-blocking bundle is the MVP one,
// which crashes with "_setThrew is not defined" on `LIKE '%' || ? || '%'`
// inside a prepared statement (the same unbound-Emscripten bug that made
// `connection.js` pick the EH bundle for the browser). The runtime behaviour
// is covered by the e2e suite, which drives the real EH build.

const NAME_AND_CPF = [
  { expression: "people.name" },
  { expression: "people.cpf", type: "cpf" },
];

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

test("blank terms produce no condition at all", () => {
  assert.equal(buildTextSearchCondition("", NAME_AND_CPF), null);
  assert.equal(buildTextSearchCondition("   ", NAME_AND_CPF), null);
  assert.equal(buildTextSearchCondition(null, NAME_AND_CPF), null);
  assert.equal(buildTextSearchCondition(undefined, NAME_AND_CPF), null);
  // No columns to search means no condition either.
  assert.equal(buildTextSearchCondition("maria", []), null);
});

test("text terms compare through strip_accents on both sides", () => {
  const built = buildTextSearchCondition("joão", [
    { expression: "people.name" },
  ]);

  // Both sides normalized: the stored name keeps its accents (only uppercased
  // by normalizePersonName), so accent-folding the column alone wouldn't match
  // a user typing without accents — and vice-versa.
  assert.equal(
    normalizeSql(built.condition),
    "(strip_accents(lower(coalesce(people.name, ''))) LIKE '%' || strip_accents(lower(?)) || '%')",
  );
  assert.deepEqual(built.params, ["joão"]);
});

test("terms are trimmed before binding", () => {
  const built = buildTextSearchCondition("  maria  ", [
    { expression: "people.name" },
  ]);
  assert.deepEqual(built.params, ["maria"]);
});

test("cpf columns bind digits only, so punctuation is irrelevant", () => {
  const withDots = buildTextSearchCondition("529.982.247-25", NAME_AND_CPF);
  const withoutDots = buildTextSearchCondition("52998224725", NAME_AND_CPF);

  // The CPF param is always the digit-stripped form; the text param keeps the
  // raw term so a name containing digits still matches literally.
  assert.deepEqual(withDots.params, ["529.982.247-25", "52998224725"]);
  assert.deepEqual(withoutDots.params, ["52998224725", "52998224725"]);
  assert.equal(withDots.condition.includes("people.cpf LIKE"), true);
});

test("short digit runs skip the cpf clause entirely", () => {
  // Otherwise a name like "ANA 2" would drag in every CPF containing a 2.
  const twoDigits = buildTextSearchCondition("52", [
    { expression: "people.cpf", type: "cpf" },
  ]);
  assert.equal(twoDigits, null);
  assert.equal(SEARCH_MIN_CPF_DIGITS, 3);

  const threeDigits = buildTextSearchCondition("529", [
    { expression: "people.cpf", type: "cpf" },
  ]);
  assert.deepEqual(threeDigits.params, ["529"]);

  // A letters-only term keeps the text clause but drops the CPF one.
  const lettersOnly = buildTextSearchCondition("maria", NAME_AND_CPF);
  assert.equal(lettersOnly.condition.includes("people.cpf"), false);
  assert.deepEqual(lettersOnly.params, ["maria"]);
});

test("multiple columns are OR-ed inside a single parenthesised group", () => {
  const built = buildTextSearchCondition("529982", NAME_AND_CPF);

  // The wrapping parentheses matter: the caller ANDs this with other filters,
  // so an unparenthesised OR would silently widen the whole WHERE clause.
  assert.equal(built.condition.trim().startsWith("("), true);
  assert.equal(built.condition.trim().endsWith(")"), true);
  assert.equal(built.condition.split(" OR ").length, 2);
  // Param order must follow clause order for positional binding.
  assert.deepEqual(built.params, ["529982", "529982"]);
});

test("null columns are coalesced so rows with NULL text still evaluate", () => {
  const built = buildTextSearchCondition("x", [
    { expression: "donors.demand" },
  ]);
  assert.equal(built.condition.includes("coalesce(donors.demand, '')"), true);
});
