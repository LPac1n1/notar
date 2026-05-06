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

function getPageFileName(baseFileName, pageIndex, totalPages) {
  if (totalPages === 1) {
    return baseFileName;
  }

  const pageSuffix = `-p${String(pageIndex + 1).padStart(2, "0")}`;
  return baseFileName.replace(/\.jpg$/, `${pageSuffix}.jpg`);
}

async function buildDemandPages(reportData, group) {
  const singleDemandData = { ...reportData, groups: [group] };
  const baseFileName = getDemandReportFileName(singleDemandData, group, "jpg");

  const doc = new SimpleImageDocument();
  drawDonationReport(doc, singleDemandData);
  const pageBytes = await doc.build();

  return pageBytes.map((bytes, pageIndex) => ({
    fileName: getPageFileName(baseFileName, pageIndex, pageBytes.length),
    bytes,
    rowCount: getDemandRowCount(group),
  }));
}

export async function exportDonationReportJpeg(filters = {}) {
  const reportData = await buildDonationReportData(filters);

  const demandPages = await Promise.all(
    reportData.groups.map((group) => buildDemandPages(reportData, group)),
  );

  const allFiles = demandPages.flat();

  if (allFiles.length === 1) {
    downloadFile({
      fileName: allFiles[0].fileName,
      content: allFiles[0].bytes,
      mimeType: "image/jpeg",
    });

    return {
      demandCount: reportData.groups.length,
      fileNames: allFiles.map((f) => f.fileName),
      rowCount: allFiles[0].rowCount,
    };
  }

  const archiveName = getZipReportFileName(reportData).replace(
    /\.zip$/,
    "-jpeg.zip",
  );
  const archiveBytes = createZipArchive(
    allFiles.map((f) => ({ name: f.fileName, bytes: f.bytes })),
  );

  downloadFile({
    fileName: archiveName,
    content: archiveBytes,
    mimeType: "application/zip",
  });

  return {
    archiveName,
    demandCount: reportData.groups.length,
    fileNames: allFiles.map((f) => f.fileName),
    rowCount: demandPages.reduce(
      (total, pages) => total + (pages[0]?.rowCount ?? 0),
      0,
    ),
  };
}
