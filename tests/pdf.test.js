import test from "node:test";
import assert from "node:assert/strict";
import { SimplePdfDocument } from "../src/features/reports/pdf/simplePdf.js";
import { createZipArchive } from "../src/features/reports/utils/simpleZip.js";

test("SimplePdfDocument builds a valid PDF byte stream", () => {
  const pdf = new SimplePdfDocument();
  pdf.drawText({
    text: "Relatório de doações",
    x: 42,
    y: 42,
  });

  const bytes = pdf.build();
  const header = new TextDecoder("ascii").decode(bytes.slice(0, 8));

  assert.equal(header, "%PDF-1.4");
  assert.ok(bytes.length > 200);
});

test("createZipArchive builds a valid zip with multiple files", () => {
  const bytes = createZipArchive([
    { name: "relatorio-a.pdf", bytes: new Uint8Array([1, 2, 3]) },
    { name: "relatorio-b.pdf", bytes: new Uint8Array([4, 5, 6]) },
  ]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder("utf-8");
  const content = decoder.decode(bytes);

  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.ok(content.includes("relatorio-a.pdf"));
  assert.ok(content.includes("relatorio-b.pdf"));
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
});
