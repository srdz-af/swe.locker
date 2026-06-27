import * as cheerio from "cheerio";
import { buildPostingKey, compactWhitespace, normalizeCompanyName, stripMetadataMarkers } from "../domain/normalize.js";

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

export function parseSimplifyJobsReadme(markdown: string, season: string) {
  const tables = extractTableBlocks(markdown);
  return tables.flatMap((table) => parseTable(table, season));
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

function parseTable(table: TableBlock, season: string) {
  const $ = cheerio.load(table.html);
  const postings: ParsedPosting[] = [];
  let previousCompany: string | null = null;

  $("tbody tr").each((_index, row) => {
    const cells = $(row).find("td");
    if (cells.length < 5) {
      return;
    }

    const companyCell = cells.eq(0);
    const roleCell = cells.eq(1);
    const locationCell = cells.eq(2);
    const applicationCell = cells.eq(3);
    const ageCell = cells.eq(4);
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
