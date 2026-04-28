import { normalizeCpf } from "./cpf.js";
import { parseValuePerNote } from "./import.js";

function isBlank(value) {
  return !String(value ?? "").trim();
}

export function hasValidationErrors(errors = {}) {
  return Object.values(errors).some(Boolean);
}

export function getFirstValidationError(errors = {}) {
  return Object.values(errors).find(Boolean) ?? "";
}

export function isValidMonthInput(value) {
  const text = String(value ?? "").trim();
  const isoMatch = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(text);
  const displayMatch = /^(\d{2})\/(\d{4})$/.exec(text);
  const monthText = isoMatch?.[2] ?? displayMatch?.[1] ?? "";

  if (!monthText) {
    return false;
  }

  const monthNumber = Number(monthText);
  return monthNumber >= 1 && monthNumber <= 12;
}

export function validateRequiredText(value, label) {
  return isBlank(value) ? `${label} e obrigatorio.` : "";
}

export function validateCpfValue(value) {
  const cpf = normalizeCpf(value);

  if (!cpf) {
    return "CPF e obrigatorio.";
  }

  if (cpf.length !== 11) {
    return "Informe um CPF valido com 11 digitos.";
  }

  return "";
}

export function validateRequiredMonth(value, label = "Mes") {
  if (isBlank(value)) {
    return `${label} e obrigatorio.`;
  }

  return isValidMonthInput(value)
    ? ""
    : `Informe ${label.toLowerCase()} valido no formato MM/AAAA.`;
}

export function validateOptionalMonth(value, label = "mes") {
  if (isBlank(value)) {
    return "";
  }

  return isValidMonthInput(value)
    ? ""
    : `Informe ${label} valido no formato MM/AAAA.`;
}

export function validatePositiveMoney(value, label) {
  return parseValuePerNote(value) === null
    ? `${label} deve ser maior que zero.`
    : "";
}

export function validatePersonForm(form = {}) {
  return {
    name: validateRequiredText(form.name, "Nome"),
    cpf: validateCpfValue(form.cpf),
  };
}

export function validateDonorForm(form = {}) {
  const donorType = form.donorType === "auxiliary" ? "auxiliary" : "holder";

  return {
    donorType: donorType ? "" : "Selecione o tipo de doador.",
    demand:
      donorType === "holder"
        ? validateRequiredText(form.demand, "Demanda")
        : "",
    holderPersonId:
      donorType === "auxiliary"
        ? validateRequiredText(form.holderPersonId, "Pessoa vinculada")
        : "",
    name: validateRequiredText(form.name, "Nome do doador"),
    cpf: validateCpfValue(form.cpf),
    donationStartDate: validateOptionalMonth(
      form.donationStartDate,
      "inicio das doacoes",
    ),
  };
}

export function validateImportUpload({
  availableImports = [],
  previewData,
  selectedFile,
  uploadForm = {},
} = {}) {
  const errors = {
    file:
      selectedFile && previewData
        ? ""
        : "Selecione um arquivo e aguarde a pre-visualizacao.",
    referenceMonth: validateRequiredMonth(
      uploadForm.referenceMonth,
      "Mes de referencia",
    ),
    valuePerNote: validatePositiveMoney(uploadForm.valuePerNote, "Valor por nota"),
    cpfColumn: validateRequiredText(uploadForm.cpfColumn, "Coluna de CPF"),
  };

  if (!errors.referenceMonth) {
    const monthKey = String(uploadForm.referenceMonth ?? "").slice(0, 7);
    const hasExistingImport = availableImports.some(
      (item) => String(item.referenceMonth ?? "").slice(0, 7) === monthKey,
    );

    if (hasExistingImport) {
      errors.referenceMonth =
        "Ja existe uma importacao cadastrada para esse mes.";
    }
  }

  return errors;
}
