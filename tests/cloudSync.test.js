import test from "node:test";
import assert from "node:assert/strict";
import { localizeHydrationError } from "../src/services/db/cloudSyncUtils.js";
import { getUserStorageObjectPath } from "../src/services/supabaseClient.js";

// ---------------------------------------------------------------------------
// getUserStorageObjectPath
// ---------------------------------------------------------------------------

test("getUserStorageObjectPath builds correct object path", () => {
  const path = getUserStorageObjectPath("user-abc-123");
  // Should be userId/dados.json (STORAGE_OBJECT_NAME default)
  assert.equal(path, "user-abc-123/dados.json");
});

test("getUserStorageObjectPath throws for null userId", () => {
  assert.throws(
    () => getUserStorageObjectPath(null),
    /usuário autenticado/,
  );
});

test("getUserStorageObjectPath throws for undefined userId", () => {
  assert.throws(
    () => getUserStorageObjectPath(undefined),
    /usuário autenticado/,
  );
});

test("getUserStorageObjectPath throws for empty string userId", () => {
  assert.throws(
    () => getUserStorageObjectPath(""),
    /usuário autenticado/,
  );
});

// ---------------------------------------------------------------------------
// localizeHydrationError — error classification
// ---------------------------------------------------------------------------

test("localizeHydrationError passes through Portuguese messages unchanged", () => {
  const original = new Error("Não foi possível processar o arquivo.");
  const result = localizeHydrationError(original);
  assert.equal(result, original);
  assert.equal(result.message, original.message);
});

test("localizeHydrationError maps 'Failed to fetch' to network message", () => {
  const result = localizeHydrationError(new Error("Failed to fetch"));
  assert.match(result.message, /conectar ao servidor/);
});

test("localizeHydrationError maps 'NetworkError' to network message", () => {
  const result = localizeHydrationError(new Error("NetworkError when fetching"));
  assert.match(result.message, /conectar ao servidor/);
});

test("localizeHydrationError maps 'unauthorized' to session expired message", () => {
  const result = localizeHydrationError(new Error("Unauthorized"));
  assert.match(result.message, /Sessão expirada/);
});

test("localizeHydrationError maps 'jwt expired' to session expired message", () => {
  const result = localizeHydrationError(new Error("JWT expired"));
  assert.match(result.message, /Sessão expirada/);
});

test("localizeHydrationError maps '401' in message to session expired", () => {
  const result = localizeHydrationError(new Error("Error 401: token invalid"));
  assert.match(result.message, /Sessão expirada/);
});

test("localizeHydrationError maps unknown English errors to generic cloud message", () => {
  const original = new Error("Something unexpected happened");
  const result = localizeHydrationError(original);
  assert.match(result.message, /baixar os dados da nuvem/);
  assert.equal(result.cause, original);
});

test("localizeHydrationError handles null error gracefully", () => {
  const result = localizeHydrationError(null);
  assert.match(result.message, /baixar os dados da nuvem/);
});

test("localizeHydrationError preserves cause on wrapped errors", () => {
  const cause = new Error("Failed to fetch");
  const result = localizeHydrationError(cause);
  assert.equal(result.cause, cause);
});
