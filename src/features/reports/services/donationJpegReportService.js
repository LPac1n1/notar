import { downloadFile } from "../../../utils/download";
import { SimpleImageDocument } from "../image/simpleImage";
import { createZipArchive } from "../utils/simpleZip";
import {
  buildDonationReportData,
  drawDonationReport,
  getDemandReportFileName,
  getDemandRowCount,
  getZipReportFileName,
} from "./donationReportRenderer";

async function createDonationReportJpeg(reportData) {
  const doc = new SimpleImageDocument();
  drawDonationReport(doc, reportData);
  return doc.build();
}

export async function exportDonationReportJpeg(filters = {}) {
  const reportData = await buildDonationReportData(filters);

  const files = await Promise.all(
    reportData.groups.map(async (group) => {
      const singleDemandData = { ...reportData, groups: [group] };

      return {
        fileName: getDemandReportFileName(singleDemandData, group, "jpg"),
        bytes: await createDonationReportJpeg(singleDemandData),
        rowCount: getDemandRowCount(group),
      };
    }),
  );

  if (files.length > 1) {
    const archiveName = getZipReportFileName(reportData).replace(
      /\.zip$/,
      "-jpeg.zip",
    );
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
    mimeType: "image/jpeg",
  });

  return {
    demandCount: files.length,
    fileNames: files.map((file) => file.fileName),
    rowCount: files.reduce((total, file) => total + file.rowCount, 0),
  };
}
