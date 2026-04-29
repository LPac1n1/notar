import test from "node:test";
import assert from "node:assert/strict";
import {
  getFirstValidationError,
  hasValidationErrors,
  isValidMonthInput,
  validateDonorForm,
  validateImportUpload,
  validatePersonForm,
} from "../src/utils/preventiveValidation.js";

test("preventive validation accepts valid month formats and rejects invalid months", () => {
  assert.equal(isValidMonthInput("2026-04"), true);
  assert.equal(isValidMonthInput("04/2026"), true);
  assert.equal(isValidMonthInput("2026-13"), false);
  assert.equal(isValidMonthInput("13/2026"), false);
});

test("person validation catches required fields before persistence", () => {
  const errors = validatePersonForm({
    name: "",
    cpf: "123",
  });

  assert.equal(hasValidationErrors(errors), true);
  assert.equal(errors.name, "Nome é obrigatório.");
  assert.equal(errors.cpf, "Informe um CPF válido com 11 dígitos.");
  assert.equal(getFirstValidationError(errors), "Nome é obrigatório.");
});

test("donor validation applies holder and auxiliary requirements", () => {
  const holderErrors = validateDonorForm({
    donorType: "holder",
    demand: "",
    name: "Maria",
    cpf: "12345678909",
    donationStartDate: "01/2026",
  });
  const auxiliaryErrors = validateDonorForm({
    donorType: "auxiliary",
    holderPersonId: "",
    name: "Joao",
    cpf: "98765432100",
    donationStartDate: "2026-01",
  });

  assert.equal(holderErrors.demand, "Demanda é obrigatório.");
  assert.equal(auxiliaryErrors.holderPersonId, "Pessoa vinculada é obrigatório.");
});

test("import validation catches missing data and duplicate months", () => {
  const errors = validateImportUpload({
    availableImports: [{ referenceMonth: "2026-03-01" }],
    previewData: { registeredFileName: "preview.csv" },
    selectedFile: { name: "preview.csv" },
    uploadForm: {
      referenceMonth: "2026-03",
      valuePerNote: "0.50",
      cpfColumn: "CPF",
    },
  });

  assert.equal(errors.referenceMonth, "Já existe uma importação cadastrada para esse mês.");

  const missingErrors = validateImportUpload({
    uploadForm: {
      referenceMonth: "",
      valuePerNote: "0",
      cpfColumn: "",
    },
  });

  assert.equal(missingErrors.file, "Selecione um arquivo e aguarde a pré-visualização.");
  assert.equal(missingErrors.valuePerNote, "Valor por nota deve ser maior que zero.");
  assert.equal(missingErrors.cpfColumn, "Coluna de CPF é obrigatório.");
});
