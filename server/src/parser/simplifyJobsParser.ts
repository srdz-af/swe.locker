import * as cheerio from "cheerio";
import { buildPostingKey, compactWhitespace, normalizeCompanyName, stripMetadataMarkers } from "../domain/normalize.js";
import type { SourceTableSchema } from "../sources/sourceDefinitions.js";

export type ParsedPosting = {
  season: string;
  category: string;
  company: string;
  normalizedCompanyName: string;
  role: string;
  locations: string[];
  applicationUrls: string[];
  primaryApplicationUrl: string | null;
  simplifyUrl: string | null;
  ageText: string | null;
  normalizedKey: string;
  rawRowContent: string;
  doesNotOfferSponsorship: boolean;
  requiresUsCitizenship: boolean;
  isClosed: boolean;
  isFaang: boolean;
  requiresAdvancedDegree: boolean;
};

type TableBlock = {
  category: string;
  html: string;
};

type TableColumnIndexes = {
  company: number;
  role: number;
  location: number;
  application: number;
  age: number;
};

const defaultTableSchema: SourceTableSchema = {
  company: ["company"],
  role: ["role"],
  location: ["location"],
  application: ["application"],
  age: ["age"]
};

export function parseSimplifyJobsReadme(
  markdown: string,
  season: string,
  options: {
    tableSchema?: SourceTableSchema;
  } = {}
) {
  const tables = extractTableBlocks(markdown);
  return tables.flatMap((table) => parseTable(table, season, options.tableSchema ?? defaultTableSchema));
}

function extractTableBlocks(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const tables: TableBlock[] = [];
  let currentCategory: string | null = null;
  let collecting = false;
  let tableLines: string[] = [];

  for (const line of lines) {
    const category = parseCategoryHeading(line);
    if (category) {
      currentCategory = category;
    }

    if (line.trim().startsWith("<table>")) {
      collecting = true;
      tableLines = [line];
      continue;
    }

    if (collecting) {
      tableLines.push(line);
      if (line.trim() === "</table>") {
        if (currentCategory) {
          tables.push({ category: currentCategory, html: tableLines.join("\n") });
        }
        collecting = false;
        tableLines = [];
      }
    }
  }

  return tables;
}

function parseCategoryHeading(line: string) {
  if (!line.startsWith("## ")) {
    return null;
  }

  const heading = line
    .replace(/^##\s+/, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s+Internship Roles\s*$/i, "")
    .trim();

  return heading || null;
}

function parseTable(table: TableBlock, season: string, tableSchema: SourceTableSchema) {
  const $ = cheerio.load(table.html);
  const postings: ParsedPosting[] = [];
  const columnIndexes = getTableColumnIndexes($, tableSchema);
  let previousCompany: string | null = null;

  $("tbody tr").each((_index, row) => {
    const cells = $(row).find("td");
    if (cells.length <= Math.max(...Object.values(columnIndexes))) {
      return;
    }

    const companyCell = cells.eq(columnIndexes.company);
    const roleCell = cells.eq(columnIndexes.role);
    const locationCell = cells.eq(columnIndexes.location);
    const applicationCell = cells.eq(columnIndexes.application);
    const ageCell = cells.eq(columnIndexes.age);
    const rawCompanyText = compactWhitespace(companyCell.text());
    const isContinuation = rawCompanyText === "↳";
    const company = isContinuation ? previousCompany : cleanCellText(rawCompanyText);

    if (!company) {
      return;
    }

    previousCompany = company;

    const rowHtml = $.html(row);
    const rowText = compactWhitespace($(row).text());
    const role = cleanCellText(roleCell.text());
    const locations = extractLocations(locationCell.html(), locationCell.text());
    const applicationUrls = applicationCell
      .find("a[href]")
      .toArray()
      .map((link) => $(link).attr("href"))
      .filter((href): href is string => Boolean(href));
    const simplifyUrl = applicationUrls.find(isSimplifyPostingUrl) ?? null;
    const primaryApplicationUrl = applicationUrls.find((url) => !isSimplifyPostingUrl(url)) ?? applicationUrls[0] ?? null;
    const normalizedCompanyName = normalizeCompanyName(company);

    const posting = {
      season,
      category: table.category,
      company,
      normalizedCompanyName,
      role,
      locations,
      applicationUrls,
      primaryApplicationUrl,
      simplifyUrl,
      ageText: compactWhitespace(ageCell.text()) || null,
      normalizedKey: "",
      rawRowContent: rowHtml,
      doesNotOfferSponsorship: rowText.includes("🛂"),
      requiresUsCitizenship: rowText.includes("🇺🇸"),
      isClosed: rowText.includes("🔒"),
      isFaang: rowText.includes("🔥"),
      requiresAdvancedDegree: rowText.includes("🎓")
    } satisfies ParsedPosting;

    posting.normalizedKey = buildPostingKey(posting);
    postings.push(posting);
  });

  return postings;
}

function getTableColumnIndexes($: cheerio.CheerioAPI, tableSchema: SourceTableSchema): TableColumnIndexes {
  const headers = $("thead th")
    .toArray()
    .map((header) => compactWhitespace($(header).text()).toLowerCase());

  return {
    company: findHeaderIndex(headers, tableSchema.company, 0),
    role: findHeaderIndex(headers, tableSchema.role, 1),
    location: findHeaderIndex(headers, tableSchema.location, 2),
    application: findHeaderIndex(headers, tableSchema.application, 3),
    age: findHeaderIndex(headers, tableSchema.age, 4)
  };
}

function findHeaderIndex(headers: string[], names: string[], fallbackIndex: number) {
  const normalizedNames = names.map((name) => compactWhitespace(name).toLowerCase());
  const index = headers.findIndex((header) =>
    normalizedNames.some((name) => header === name || header.includes(name))
  );
  return index >= 0 ? index : fallbackIndex;
}

function cleanCellText(value: string) {
  return compactWhitespace(stripMetadataMarkers(value).replace("↳", ""));
}

function extractLocations(cellHtml: string | null, cellText: string) {
  const htmlWithLineBreaks = cellHtml?.replace(/<br\s*\/?>/gi, "\n") ?? "";
  const text = cheerio.load(`<div>${htmlWithLineBreaks}</div>`)("div").text();
  const locations = text
    .split(/\n| {2,}|\s+\|\s+/)
    .map(compactWhitespace)
    .filter(Boolean);

  return locations.length > 0 ? locations : [compactWhitespace(cellText)].filter(Boolean);
}

function isSimplifyPostingUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "simplify.jobs" && parsed.pathname.startsWith("/p/");
  } catch {
    return false;
  }
}
