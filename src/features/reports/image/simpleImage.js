const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const RENDER_SCALE = 2;
const JPEG_QUALITY = 0.92;

function getFontFamily() {
  return 'Helvetica, "Helvetica Neue", Arial, sans-serif';
}

function applyRect(ctx, command) {
  if (command.fillColor) {
    ctx.fillStyle = command.fillColor;
    ctx.fillRect(command.x, command.y, command.width, command.height);
  }

  if (command.strokeColor) {
    ctx.strokeStyle = command.strokeColor;
    ctx.lineWidth = command.lineWidth;
    ctx.strokeRect(command.x, command.y, command.width, command.height);
  }
}

function applyLine(ctx, command) {
  ctx.strokeStyle = command.color;
  ctx.lineWidth = command.lineWidth;
  ctx.beginPath();
  ctx.moveTo(command.x1, command.y1);
  ctx.lineTo(command.x2, command.y2);
  ctx.stroke();
}

function applyText(ctx, command) {
  const weight = command.font === "bold" ? "bold" : "normal";

  ctx.font = `${weight} ${command.size}px ${getFontFamily()}`;
  ctx.fillStyle = command.color;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(command.text ?? "", command.x, command.y);
}

function blobToBytes(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Falha ao ler imagem gerada."));
    reader.readAsArrayBuffer(blob);
  });
}

export class SimpleImageDocument {
  constructor() {
    this.width = PAGE_WIDTH;
    this.height = PAGE_HEIGHT;
    this.pages = [[]];
    this.currentPageIndex = 0;
  }

  get currentPage() {
    return this.pages[this.currentPageIndex];
  }

  addPage() {
    this.pages.push([]);
    this.currentPageIndex = this.pages.length - 1;
  }

  getPageCount() {
    return this.pages.length;
  }

  withPage(pageIndex, callback) {
    if (!this.pages[pageIndex]) {
      return;
    }

    const previousIndex = this.currentPageIndex;
    this.currentPageIndex = pageIndex;
    callback();
    this.currentPageIndex = previousIndex;
  }

  drawRect({
    x,
    y,
    width,
    height,
    fillColor = null,
    strokeColor = null,
    lineWidth = 1,
  }) {
    this.currentPage.push({
      type: "rect",
      x,
      y,
      width,
      height,
      fillColor,
      strokeColor,
      lineWidth,
    });
  }

  drawLine({ x1, y1, x2, y2, color = "#000000", lineWidth = 1 }) {
    this.currentPage.push({
      type: "line",
      x1,
      y1,
      x2,
      y2,
      color,
      lineWidth,
    });
  }

  drawText({
    text,
    x,
    y,
    font = "regular",
    size = 10,
    color = "#000000",
  }) {
    this.currentPage.push({ type: "text", text, x, y, font, size, color });
  }

  async build() {
    const pageCount = this.pages.length;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(this.width * RENDER_SCALE);
    canvas.height = Math.ceil(this.height * pageCount * RENDER_SCALE);

    const ctx = canvas.getContext("2d");
    ctx.scale(RENDER_SCALE, RENDER_SCALE);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, this.width, this.height * pageCount);

    this.pages.forEach((commands, pageIndex) => {
      ctx.save();
      ctx.translate(0, pageIndex * this.height);

      for (const command of commands) {
        if (command.type === "rect") {
          applyRect(ctx, command);
        } else if (command.type === "line") {
          applyLine(ctx, command);
        } else if (command.type === "text") {
          applyText(ctx, command);
        }
      }

      ctx.restore();
    });

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
            return;
          }

          reject(new Error("Falha ao gerar imagem JPEG."));
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    });

    return blobToBytes(blob);
  }
}
