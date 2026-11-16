import { VAT_RATES, vatRate, type Country } from "@kummie/core";
import type { Job } from "./types";

/**
 * Daily VAT rate check (D-029). Asks the European Commission's official "Taxes in Europe" database
 * (TEDB) for the standard rate of every country in our VAT table — for today and for 30 days ahead —
 * and fails loudly when a rate differs from `VAT_RATES` in packages/core.
 *
 * It never changes the table by itself: a wrong automatic switch would put the wrong VAT on invoices
 * and OSS returns. A failure is the alert — cPanel cron emails the job's output to the owner (and
 * from M1 the email adapter sends it too). Fixing it means adding a dated row to `VAT_RATES` and
 * telling the accountant.
 */

export const TEDB_URL = "https://ec.europa.eu/taxation_customs/tedb/ws/VatRetrievalService";
const SOAP_ACTION = "urn:ec.europa.eu:taxud:tedb:services:v1:VatRetrievalService/RetrieveVatRates";

/** TEDB uses the EU code EL for Greece. */
const TEDB_CODE: Record<Country, string> = { BG: "BG", RO: "RO", GR: "EL", PL: "PL" };

export type FetchLike = (url: string, init: RequestInit) => Promise<Pick<Response, "ok" | "status" | "text">>;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function requestBody(codes: readonly string[], day: string): string {
  const states = codes.map((code) => `<urn1:isoCode>${code}</urn1:isoCode>`).join("");
  return (
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
    'xmlns:urn="urn:ec.europa.eu:taxud:tedb:services:v1:IVatRetrievalService" ' +
    'xmlns:urn1="urn:ec.europa.eu:taxud:tedb:services:v1:IVatRetrievalService:types">' +
    "<soapenv:Header/><soapenv:Body><urn:retrieveVatRatesReqMsg>" +
    `<urn1:memberStates>${states}</urn1:memberStates><urn1:situationOn>${day}</urn1:situationOn>` +
    "</urn:retrieveVatRatesReqMsg></soapenv:Body></soapenv:Envelope>"
  );
}

function tag(block: string, name: string): string | undefined {
  return block.match(new RegExp(`<(?:\\w+:)?${name}>([^<]*)</(?:\\w+:)?${name}>`))?.[1]?.trim();
}

/** Standard rates in percent by TEDB country code, parsed from a TEDB SOAP response. */
export function parseStandardRates(xml: string): Map<string, number> {
  const rates = new Map<string, number>();
  const blocks = xml.split(/<(?:\w+:)?vatRateResults>/).slice(1);
  for (const block of blocks) {
    if (tag(block, "type") !== "STANDARD") continue;
    const state = tag(block, "memberState");
    const value = Number(block.match(/<(?:\w+:)?value>([\d.]+)<\/(?:\w+:)?value>/)?.[1]);
    if (state && Number.isFinite(value)) rates.set(state, value);
  }
  return rates;
}

export async function fetchStandardRates(
  countries: readonly Country[],
  day: string,
  fetchImpl: FetchLike,
  signal?: AbortSignal,
): Promise<Map<Country, number>> {
  const response = await fetchImpl(TEDB_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: SOAP_ACTION },
    body: requestBody(
      countries.map((country) => TEDB_CODE[country]),
      day,
    ),
    signal: signal ?? null,
  });
  if (!response.ok) throw new Error(`EU TEDB answered HTTP ${response.status}`);
  const byCode = parseStandardRates(await response.text());
  const result = new Map<Country, number>();
  for (const country of countries) {
    const percent = byCode.get(TEDB_CODE[country]);
    if (percent === undefined) throw new Error(`EU TEDB returned no standard rate for ${country} on ${day}`);
    result.set(country, percent);
  }
  return result;
}

export type RateMismatch = { country: Country; day: string; official: number; ours: number };

/** Compares TEDB with our table for each day; returns every mismatch (empty when all agree). */
export async function findRateMismatches(
  days: readonly Date[],
  fetchImpl: FetchLike,
  signal?: AbortSignal,
): Promise<RateMismatch[]> {
  const countries = [...new Set(VAT_RATES.map((entry) => entry.country))];
  const mismatches: RateMismatch[] = [];
  for (const date of days) {
    const day = isoDay(date);
    const official = await fetchStandardRates(countries, day, fetchImpl, signal);
    for (const country of countries) {
      const ours = Math.round(vatRate(country, date) * 10_000) / 100;
      const theirs = official.get(country) as number;
      if (Math.round(theirs * 100) !== Math.round(ours * 100)) {
        mismatches.push({ country, day, official: theirs, ours });
      }
    }
  }
  return mismatches;
}

/** Look this far ahead so a change announced in advance is caught before it applies. */
export const LOOKAHEAD_DAYS = 30;

export function vatRateCheckJob(fetchImpl: FetchLike = fetch): Job {
  return {
    name: "vat-rate-check",
    schedule: "daily",
    timeoutMs: 60_000,
    run: async ({ now, signal, log }) => {
      const ahead = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
      const mismatches = await findRateMismatches([now, ahead], fetchImpl, signal);
      if (mismatches.length === 0) {
        log.info(`[vat-rate-check] OK — rates match EU TEDB for today and +${LOOKAHEAD_DAYS} days`);
        return;
      }
      const lines = mismatches.map(
        (m) => `${m.country} on ${m.day}: EU TEDB says ${m.official} %, our table says ${m.ours} %`,
      );
      throw new Error(
        `VAT rates differ from the official EU data — ${lines.join("; ")}. ` +
          "Add a dated row to VAT_RATES in packages/core/src/vat.ts and tell the accountant.",
      );
    },
  };
}
