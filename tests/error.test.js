import test from "node:test";
import assert from "node:assert/strict";
import {
  getErrorMessage,
  isUserFacingError,
  UserFacingError,
} from "../src/utils/error.js";

test("getErrorMessage extracts message from Error instances", () => {
  assert.equal(
    getErrorMessage(new Error("Falha controlada"), "Fallback"),
    "Falha controlada",
  );
});

test("getErrorMessage extracts message from error-like objects", () => {
  assert.equal(
    getErrorMessage({ message: "Mensagem remota" }, "Fallback"),
    "Mensagem remota",
  );
});

test("getErrorMessage falls back when value is not readable", () => {
  assert.equal(getErrorMessage(null, "Fallback"), "Fallback");
});

test("isUserFacingError detects expected validation errors", () => {
  assert.equal(isUserFacingError(new UserFacingError("CPF duplicado")), true);
  assert.equal(isUserFacingError(new Error("Falha técnica")), false);
});
