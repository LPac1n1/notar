import {
  registerFileText,
} from "../db";
import {
  getImportFileExtension,
  isExcelImportExtension,
  readFileAsUtf8Text,
} from "../../utils/import";

/**
 * Registra a planilha enviada como arquivo virtual do DuckDB.
 *
 * Este passo e IDENTICO para doacoes e creditos: converte XLSX em CSV
 * (escolhendo a primeira aba com conteudo) ou le o texto direto, e registra
 * o resultado. As duas metades do sistema tinham a mesma funcao copiada,
 * byte a byte — uma duplicacao que so esperava divergir e fazer os dois
 * lados lerem o mesmo arquivo de formas diferentes.
 */
export async function registerSpreadsheetPreviewFile(file, registeredFileName) {
  const fileExtension = getImportFileExtension(file.name);

  if (isExcelImportExtension(fileExtension)) {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const fileBuffer = await file.arrayBuffer();
    await workbook.xlsx.load(fileBuffer);

    const worksheet =
      workbook.worksheets.find(
        (currentWorksheet) =>
          currentWorksheet.actualRowCount > 0 ||
          currentWorksheet.actualColumnCount > 0,
      ) ?? workbook.worksheets[0];

    if (!worksheet) {
      throw new Error("A planilha do Excel não possui nenhuma aba com dados.");
    }

    const csvBuffer = await workbook.csv.writeBuffer({
      sheetName: worksheet.name,
    });
    const csvText = new TextDecoder("utf-8").decode(csvBuffer);
    await registerFileText(registeredFileName, csvText);

    return {
      sourceType: "excel",
      worksheetName: worksheet.name,
      worksheetCount: workbook.worksheets.length,
    };
  }

  const fileText = await readFileAsUtf8Text(file);
  await registerFileText(registeredFileName, fileText);

  return {
    sourceType: "text",
    worksheetName: "",
    worksheetCount: 0,
  };
}
