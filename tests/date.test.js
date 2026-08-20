import test from "node:test";
import assert from "node:assert/strict";
import {
  formatDatePtBR,
  formatDateTimePtBR,
  formatMonthYear,
  hasDonationStartConflict,
  startOfMonth,
  subtractOneMonth,
} from "../src/utils/date.js";

test("startOfMonth normalizes supported formats", () => {
  assert.equal(startOfMonth("2026-03"), "2026-03-01");
  assert.equal(startOfMonth("2026-03-18"), "2026-03-01");
  assert.equal(startOfMonth("2026-03-18T12:00:00Z"), "2026-03-01");
  assert.equal(startOfMonth("invalido"), "");
});

test("formatMonthYear returns month name capitalized in pt-BR", () => {
  assert.equal(formatMonthYear("2026-03-01"), "Março de 2026");
  assert.equal(formatMonthYear("2026-10"), "Outubro de 2026");
});

test("formatDatePtBR returns Brazilian date format", () => {
  assert.equal(formatDatePtBR("2026-04-14T12:00:00Z"), "14/04/2026");
});

test("formatDateTimePtBR returns Brazilian date and time format", () => {
  assert.equal(formatDateTimePtBR("2026-04-14 10:30:00"), "14/04/2026, 10:30");
});

test("subtractOneMonth returns the previous month boundary", () => {
  assert.equal(subtractOneMonth("2026-03-01"), "2026-02-01");
  assert.equal(subtractOneMonth("2026-01-01"), "2025-12-01");
});

test("hasDonationStartConflict detects donations before donor start month", () => {
  assert.equal(hasDonationStartConflict("2026-02-01", "2026-01-01"), true);
  assert.equal(hasDonationStartConflict("2026-02-01", "2026-02-01"), false);
  assert.equal(hasDonationStartConflict("", "2026-02-01"), false);
});

test("formatDatePtBR não desloca data sem hora por causa do fuso", () => {
  // `new Date("2026-03-01")` é meia-noite em UTC pela especificação; em UTC-3
  // isso volta um dia e a data da nota aparecia no mês anterior ao da própria
  // competência. A formatação de data pura sai do texto, sem passar por `Date`.
  assert.equal(formatDatePtBR("2026-03-01"), "01/03/2026");
  assert.equal(formatDatePtBR("2026-01-01"), "01/01/2026");
  assert.equal(formatDatePtBR("2025-12-31"), "31/12/2025");

  // Com hora, continua pelo caminho que converte para o fuso local.
  assert.equal(formatDatePtBR("2026-03-01 10:00:00"), "01/03/2026");

  assert.equal(formatDatePtBR(""), "");
  assert.equal(formatDatePtBR("nada disso"), "nada disso");
});
