import { describe, expect, it } from "vitest";
import { runTick } from "./tick";
import { jobsFor } from "./tick";
import { jobs } from "./registry";
import { findRateMismatches, parseStandardRates, vatRateCheckJob, type FetchLike } from "./vat-rates";

/** Trimmed real TEDB answer (2026-11-16): one REDUCED entry plus the four STANDARD ones. */
function tedbResponse(rates: Record<string, number>): string {
  const reduced =
    "<vatRateResults><memberState>BG</memberState><type>REDUCED</type><rate><type>REDUCED_RATE</type>" +
    "<value>9.0</value></rate><situationOn>2026-07-01+02:00</situationOn></vatRateResults>";
  const standard = Object.entries(rates)
    .map(
      ([state, value]) =>
        `<vatRateResults><memberState>${state}</memberState><type>STANDARD</type><rate><type>DEFAULT</type>` +
        `<value>${value.toFixed(1)}</value></rate><situationOn>2026-07-01+02:00</situationOn></vatRateResults>`,
    )
    .join("");
  return (
    '<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Header/><env:Body>' +
    '<ns0:retrieveVatRatesRespMsg xmlns="urn:ec.europa.eu:taxud:tedb:services:v1:IVatRetrievalService:types" ' +
    'xmlns:ns0="urn:ec.europa.eu:taxud:tedb:services:v1:IVatRetrievalService"><additionalInformation/>' +
    reduced +
    standard +
    "</ns0:retrieveVatRatesRespMsg></env:Body></env:Envelope>"
  );
}

const CURRENT = { BG: 20, RO: 21, EL: 24, PL: 23 };

function fakeFetch(rates: Record<string, number>, calls: string[] = []): FetchLike {
  return async (_url, init) => {
    calls.push(String(init.body));
    return { ok: true, status: 200, text: async () => tedbResponse(rates) };
  };
}

const silent = { info: () => {}, error: () => {} };
const NOW = new Date("2026-11-16T05:00:00Z");

describe("VAT rate check (EU TEDB)", () => {
  it("parses only standard rates and ignores reduced ones", () => {
    const rates = parseStandardRates(tedbResponse(CURRENT));
    expect(Object.fromEntries(rates)).toEqual({ BG: 20, RO: 21, EL: 24, PL: 23 });
  });

  it("asks for Greece as EL and checks today and 30 days ahead", async () => {
    const calls: string[] = [];
    expect(await findRateMismatches([NOW], fakeFetch(CURRENT, calls))).toEqual([]);
    expect(calls[0]).toContain("<urn1:isoCode>EL</urn1:isoCode>");
    expect(calls[0]).toContain("<urn1:situationOn>2026-11-16</urn1:situationOn>");

    calls.length = 0;
    const [result] = await runTick([vatRateCheckJob(fakeFetch(CURRENT, calls))], silent, NOW);
    expect(result?.ok).toBe(true);
    expect(calls.map((body) => body.match(/situationOn>([\d-]+)</)?.[1])).toEqual([
      "2026-11-16",
      "2026-12-16",
    ]);
  });

  it("fails with a clear message when an official rate differs from our table", async () => {
    const [result] = await runTick([vatRateCheckJob(fakeFetch({ ...CURRENT, RO: 23 }))], silent, NOW);
    expect(result?.ok).toBe(false);
    expect(result?.error).toMatch(/RO on 2026-11-16: EU TEDB says 23 %, our table says 21 %/);
    expect(result?.error).toMatch(/VAT_RATES/);
  });

  it("fails when TEDB is unreachable or a country is missing", async () => {
    const down: FetchLike = async () => ({ ok: false, status: 503, text: async () => "" });
    expect((await runTick([vatRateCheckJob(down)], silent, NOW))[0]?.error).toMatch(/HTTP 503/);
    const partial = fakeFetch({ BG: 20, RO: 21, EL: 24 });
    expect((await runTick([vatRateCheckJob(partial)], silent, NOW))[0]?.error).toMatch(
      /no standard rate for PL/,
    );
  });

  it("is registered as a daily job, not on every tick", () => {
    expect(jobsFor(jobs, "daily").map((job) => job.name)).toEqual(["vat-rate-check"]);
    expect(jobsFor(jobs, "frequent")).toEqual([]);
  });
});
