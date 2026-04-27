const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

const CP1252_OVERRIDES = new Map([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);

function toWinAnsiByte(character) {
  const codePoint = character.codePointAt(0);

  if (codePoint <= 0x7f || (codePoint >= 0xa0 && codePoint <= 0xff)) {
    return codePoint;
  }

  return CP1252_OVERRIDES.get(codePoint) ?? 0x3f;
}

function toPdfString(value) {
  return `(${Array.from(String(value ?? ""))
    .map((character) => {
      const byte = toWinAnsiByte(character);

      if (byte === 0x28 || byte === 0x29 || byte === 0x5c) {
        return `\\${String.fromCharCode(byte)}`;
      }

      if (byte < 0x20 || byte > 0x7e) {
        return `\\${byte.toString(8).padStart(3, "0")}`;
      }

      return String.fromCharCode(byte);
    })
    .join("")})`;
}

function toPdfNumber(value) {
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

export function hexToPdfRgb(hexColor) {
  const normalizedColor = String(hexColor ?? "#000000").replace("#", "");

  return [
    Number.parseInt(normalizedColor.slice(0, 2), 16) / 255,
    Number.parseInt(normalizedColor.slice(2, 4), 16) / 255,
    Number.parseInt(normalizedColor.slice(4, 6), 16) / 255,
  ];
}

function rgbCommand(color, operator) {
  const rgb = Array.isArray(color) ? color : hexToPdfRgb(color);
  return `${rgb.map(toPdfNumber).join(" ")} ${operator}`;
}

function estimateCharacterWidth(character, fontSize) {
  if (character === " ") return fontSize * 0.28;
  if ("il.,:;|!".includes(character)) return fontSize * 0.26;
  if ("mwMW@#%&".includes(character)) return fontSize * 0.78;
  if (/[A-Z0-9]/.test(character)) return fontSize * 0.58;
  return fontSize * 0.5;
}

export function estimateTextWidth(text, fontSize = 10) {
  return Array.from(String(text ?? "")).reduce(
    (width, character) => width + estimateCharacterWidth(character, fontSize),
    0,
  );
}

export function wrapText(text, maxWidth, fontSize = 10) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = "";

  const pushLongWord = (word) => {
    let currentWordLine = "";

    for (const character of Array.from(word)) {
      const nextLine = `${currentWordLine}${character}`;

      if (currentWordLine && estimateTextWidth(nextLine, fontSize) > maxWidth) {
        lines.push(currentWordLine);
        currentWordLine = character;
      } else {
        currentWordLine = nextLine;
      }
    }

    currentLine = currentWordLine;
  };

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (estimateTextWidth(nextLine, fontSize) <= maxWidth) {
      currentLine = nextLine;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = "";
    }

    if (estimateTextWidth(word, fontSize) > maxWidth) {
      pushLongWord(word);
    } else {
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length ? lines : [""];
}

function asciiToBytes(value) {
  const bytes = new Uint8Array(value.length);

  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }

  return bytes;
}

export class SimplePdfDocument {
  constructor() {
    this.width = PAGE_WIDTH;
    this.height = PAGE_HEIGHT;
    this.pages = [];
    this.currentPage = null;
    this.addPage();
  }

  addPage() {
    this.currentPage = [];
    this.pages.push(this.currentPage);
  }

  getPageCount() {
    return this.pages.length;
  }

  withPage(pageIndex, callback) {
    const previousPage = this.currentPage;
    const targetPage = this.pages[pageIndex];

    if (!targetPage) {
      return;
    }

    this.currentPage = targetPage;
    callback();
    this.currentPage = previousPage;
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
    const pdfY = this.height - y - height;
    const commands = ["q"];

    if (fillColor) {
      commands.push(rgbCommand(fillColor, "rg"));
    }

    if (strokeColor) {
      commands.push(rgbCommand(strokeColor, "RG"));
      commands.push(`${toPdfNumber(lineWidth)} w`);
    }

    commands.push(
      `${toPdfNumber(x)} ${toPdfNumber(pdfY)} ${toPdfNumber(width)} ${toPdfNumber(height)} re`,
    );
    commands.push(fillColor && strokeColor ? "B" : fillColor ? "f" : "S");
    commands.push("Q");
    this.currentPage.push(commands.join("\n"));
  }

  drawLine({
    x1,
    y1,
    x2,
    y2,
    color = "#000000",
    lineWidth = 1,
  }) {
    this.currentPage.push(
      [
        "q",
        rgbCommand(color, "RG"),
        `${toPdfNumber(lineWidth)} w`,
        `${toPdfNumber(x1)} ${toPdfNumber(this.height - y1)} m`,
        `${toPdfNumber(x2)} ${toPdfNumber(this.height - y2)} l`,
        "S",
        "Q",
      ].join("\n"),
    );
  }

  drawText({
    text,
    x,
    y,
    font = "regular",
    size = 10,
    color = "#000000",
  }) {
    const fontName = font === "bold" ? "F2" : "F1";

    this.currentPage.push(
      [
        "BT",
        `/${fontName} ${toPdfNumber(size)} Tf`,
        rgbCommand(color, "rg"),
        `1 0 0 1 ${toPdfNumber(x)} ${toPdfNumber(this.height - y)} Tm`,
        `${toPdfString(text)} Tj`,
        "ET",
      ].join("\n"),
    );
  }

  build() {
    const objects = [];
    const addObject = (content) => {
      objects.push(content);
      return objects.length;
    };

    const pagesRef = addObject("");
    const regularFontRef = addObject(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    );
    const boldFontRef = addObject(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    );
    const pageRefs = [];

    for (const pageCommands of this.pages) {
      const stream = `${pageCommands.join("\n")}\n`;
      const contentRef = addObject(
        `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
      );
      const pageRef = addObject(
        [
          "<< /Type /Page",
          `/Parent ${pagesRef} 0 R`,
          `/MediaBox [0 0 ${toPdfNumber(this.width)} ${toPdfNumber(this.height)}]`,
          `/Resources << /Font << /F1 ${regularFontRef} 0 R /F2 ${boldFontRef} 0 R >> >>`,
          `/Contents ${contentRef} 0 R`,
          ">>",
        ].join("\n"),
      );
      pageRefs.push(pageRef);
    }

    objects[pagesRef - 1] =
      `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;
    const catalogRef = addObject(`<< /Type /Catalog /Pages ${pagesRef} 0 R >>`);

    let output = "%PDF-1.4\n";
    const offsets = [0];

    objects.forEach((objectContent, index) => {
      offsets.push(output.length);
      output += `${index + 1} 0 obj\n${objectContent}\nendobj\n`;
    });

    const xrefOffset = output.length;
    output += `xref\n0 ${objects.length + 1}\n`;
    output += "0000000000 65535 f \n";
    offsets.slice(1).forEach((offset) => {
      output += `${String(offset).padStart(10, "0")} 00000 n \n`;
    });
    output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogRef} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return asciiToBytes(output);
  }
}
