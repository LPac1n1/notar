import { downloadFile } from "../../../utils/download";
import { SimplePdfDocument } from "../pdf/simplePdf";
import { createZipArchive } from "../utils/simpleZip";
import {
  buildDonationReportData,
  drawDonationReport,
  getDemandReportFileName,
  getDemandRowCount,
  getZipReportFileName,
} from "./donationReportRenderer";

function createDonationReportPdf(reportData) {
  const pdf = new SimplePdfDocument();
  drawDonationReport(pdf, reportData);
  return pdf.build();
}

export async function exportDonationReportPdf(filters = {}) {
  const reportData = await buildDonationReportData(filters);
  const files = reportData.groups.map((group) => {
    const singleDemandData = { ...reportData, groups: [group] };

    return {
      fileName: getDemandReportFileName(singleDemandData, group, "pdf"),
      bytes: createDonationReportPdf(singleDemandData),
      rowCount: getDemandRowCount(group),
    };
  });

  if (files.length > 1) {
    const archiveName = getZipReportFileName(reportData);
    const archiveBytes = createZipArchive(
      files.map((file) => ({ name: file.fileName, bytes: file.bytes })),
    );

    downloadFile({
      fileName: archiveName,
      content: archiveBytes,
      mimeType: "application/zip",
    });

    return {
      archiveName,
      demandCount: files.length,
      fileNames: files.map((file) => file.fileName),
      rowCount: files.reduce((total, file) => total + file.rowCount, 0),
    };
  }

  downloadFile({
    fileName: files[0].fileName,
    content: files[0].bytes,
    mimeType: "application/pdf",
  });

  return {
    demandCount: files.length,
    fileNames: files.map((file) => file.fileName),
    rowCount: files.reduce((total, file) => total + file.rowCount, 0),
  };
}
