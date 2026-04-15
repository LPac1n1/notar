import test from "node:test";
import assert from "node:assert/strict";
import { buildCsvContent } from "../src/utils/csv.js";

test("buildCsvContent generates csv with semicolon separator and escaping", () => {
  const csv = buildCsvContent(
    [
      { key: "name", label: "Nome" },
      { key: "notes", label: "Observacao" },
    ],
    [
      {
        name: "Maria",
        notes: 'Texto com "aspas"; e separador',
      },
    ],
  );

  assert.equal(
    csv,
    'Nome;Observacao\nMaria;"Texto com ""aspas""; e separador"',
  );
});
