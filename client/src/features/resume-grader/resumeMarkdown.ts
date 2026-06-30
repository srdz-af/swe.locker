export type ResumeParseWarning =
  | "empty_text"
  | "missing_sections"
  | "missing_bullets"
  | "many_short_lines"
  | "garbled_text"
  | "low_structure_confidence";

export type ParsedResumeDocument = {
  name: string | null;
  headline: string | null;
  contact: string | null;
  sections: ParsedResumeSection[];
  warnings: ResumeParseWarning[];
  confidence: number;
};

export type ParsedResumeSection = {
  title: string;
  blocks: ParsedResumeBlock[];
};

export type ParsedResumeBlock = ParsedResumeEntryBlock | ParsedResumeSkillBlock | ParsedResumeParagraphBlock;

export type ParsedResumeEntryBlock = {
  type: "entry";
  title: string;
  subtitle: string | null;
  dateRange: string | null;
  bullets: string[];
};

export type ParsedResumeSkillBlock = {
  type: "skill";
  label: string;
  value: string;
};

export type ParsedResumeParagraphBlock = {
  type: "paragraph";
  text: string;
};

const canonicalSectionTitles = new Map<string, string>([
  ["experience", "Experience"],
  ["work experience", "Experience"],
  ["professional experience", "Experience"],
  ["employment", "Experience"],
  ["summary", "Summary"],
  ["profile", "Profile"],
  ["projects", "Projects"],
  ["selected projects", "Projects"],
  ["personal projects", "Personal Projects"],
  ["education", "Education"],
  ["technical skills", "Technical Skills"],
  ["skills", "Skills"],
  ["technologies", "Technical Skills"],
  ["awards", "Awards"],
  ["honors", "Honors"],
  ["honors & awards", "Honors and Awards"],
  ["honors and awards", "Honors and Awards"],
  ["achievements", "Achievements"],
  ["awards & achievements", "Awards & Achievements"],
  ["awards and achievements", "Awards & Achievements"],
  ["achievements & leadership", "Achievements & Leadership"],
  ["achievements and leadership", "Achievements & Leadership"],
  ["leadership", "Leadership"],
  ["leadership & achievements", "Leadership & Achievements"],
  ["leadership and achievements", "Leadership & Achievements"],
  ["leadership & volunteering", "Leadership & Volunteering"],
  ["leadership and volunteering", "Leadership & Volunteering"],
  ["volunteering", "Volunteering"],
  ["professional development", "Professional Development"],
  ["certifications", "Certifications"],
  ["publications", "Publications"]
]);

const bulletPattern = /^[-*•]\s*/;
const resumeBulletLeadPattern =
  /^(?:Achieve|Achieved|Architect|Architected|Automate|Automated|Build|Built|Coach|Coached|Collaborate|Collaborated|Configure|Configured|Create|Created|Define|Defined|Deliver|Delivered|Deploy|Deployed|Design|Designed|Develop|Developed|Drive|Drove|Enable|Enabled|Establish|Established|Evaluate|Evaluated|Generate|Generated|Implement|Implemented|Improve|Improved|Increase|Increased|Integrate|Integrated|Introduce|Introduced|Launch|Launched|Lead|Led|Maintain|Maintained|Manage|Managed|Migrate|Migrated|Monitor|Monitored|Optimize|Optimized|Own|Owned|Partner|Partnered|Plan|Planned|Qualify|Qualified|Reduce|Reduced|Refactor|Refactored|Resolve|Resolved|Scale|Scaled|Select|Selected|Ship|Shipped|Spearhead|Spearheaded|Streamline|Streamlined|Support|Supported|Train|Trained)\b/i;
const yearPattern = String.raw`(?:19|20)\d{2}`;
const monthNamePattern = String.raw`(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?`;
const numericMonthYearPattern = String.raw`(?:(?:0?[1-9]|1[0-2])(?:\/|\.|-)${yearPattern}|${yearPattern}(?:\/|\.|-)(?:0?[1-9]|1[0-2]))`;
const seasonYearPattern = String.raw`(?:Spring|Summer|Fall|Autumn|Winter|Q[1-4])\s+${yearPattern}`;
const monthYearPattern = String.raw`${monthNamePattern}\s+${yearPattern}`;
const concreteDateTermPattern = String.raw`(?:${monthYearPattern}|${numericMonthYearPattern}|${seasonYearPattern}|${yearPattern})`;
const dateTermPattern = String.raw`(?:${concreteDateTermPattern}|Present|Current|Now)`;
const dateDashSeparatorPattern = String.raw`(?:-|\u2010|\u2011|\u2012|\u2013|\u2014|\u2015|\u2212)`;
const dateRangeSeparatorPattern = String.raw`(?:${dateDashSeparatorPattern}|to|through|until)`;
const dateHeaderInnerPattern = String.raw`(?:${dateTermPattern}\s*${dateRangeSeparatorPattern}\s*${dateTermPattern}|${dateTermPattern}(?:\s*&\s*${dateTermPattern})+|${concreteDateTermPattern})`;
const dateHeaderPattern = new RegExp(String.raw`\b${dateHeaderInnerPattern}\b`, "gi");
const parenthesizedDatedDescriptionPattern = new RegExp(
  String.raw`(^|[.!?]\s+)([^.!?]+?)\s*\((${dateHeaderInnerPattern})\)\s*:\s*`,
  "gi"
);
const standaloneSectionKeywordPattern =
  /\b(?:achievements?|activities|awards?|certifications?|education|experiences?|honou?rs?|leadership|projects?|publications?|skills?|technologies|volunteering)\b/i;
const standaloneSectionEndingPattern =
  /\b(?:achievements?|activities|awards?|certifications?|education|experiences?|honou?rs?|leadership|projects?|publications?|skills?|technologies|volunteering)\b$/i;
const standaloneSectionConnectorPattern = /(?:\s[&/]\s|\s*[&/]\s*|\b(?:and|or)\b)/i;
const sectionTitleAliases = [...canonicalSectionTitles.keys()].sort((left, right) => right.length - left.length);

export function parseResumeMarkdownModel(text: string): ParsedResumeDocument {
  const lines = normalizeResumeLines(text);

  if (lines.length === 0) {
    return {
      name: null,
      headline: null,
      contact: null,
      sections: [],
      warnings: ["empty_text", "missing_sections", "missing_bullets", "low_structure_confidence"],
      confidence: 0
    };
  }

  const firstSectionIndex = lines.findIndex((line) => getCanonicalSectionTitle(line) !== null);
  const headerLines = firstSectionIndex >= 0 ? lines.slice(0, firstSectionIndex) : [];
  const sectionLines = firstSectionIndex >= 0 ? lines.slice(firstSectionIndex) : lines;
  const sections = parseResumeSections(sectionLines);
  const document: ParsedResumeDocument = {
    name: headerLines[0] ?? null,
    headline: getHeadline(headerLines),
    contact: getContactLine(headerLines),
    sections,
    warnings: [],
    confidence: 0
  };
  const warnings = getResumeParseWarnings(lines, document);

  return {
    ...document,
    warnings,
    confidence: getResumeParseConfidence(warnings)
  };
}

export function renderResumeMarkdown(document: ParsedResumeDocument) {
  const output: string[] = [];

  if (document.name) {
    output.push(`# ${document.name}`);
  }

  if (document.headline) {
    output.push("", `**${document.headline}**  `);
  }

  if (document.contact) {
    output.push(document.contact);
  }

  for (const section of document.sections) {
    output.push("", `## ${section.title}`);
    output.push("", "---");

    for (const block of section.blocks) {
      if (block.type === "entry") {
        output.push("", `### ${block.title}`);

        if (block.subtitle || block.dateRange) {
          output.push(getEntryMetadataMarkdown(block));
        }

        for (const bullet of block.bullets) {
          output.push(`- ${bullet}`);
        }
      } else if (block.type === "skill") {
        output.push("", `**${block.label}:** ${block.value}`);
      } else {
        output.push(block.text);
      }
    }
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeResumeLines(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[●▪◦·‣⁃∙]/g, "•")
    .replace(/[–—]/g, "-")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .flatMap(splitInlineSectionHeadings)
    .flatMap(splitInlineDatedDescriptions);
}

function getHeadline(headerLines: string[]) {
  const line = headerLines.slice(1).find((candidate) => !isLikelyContactLine(candidate));
  return line ?? null;
}

function getContactLine(headerLines: string[]) {
  const line = headerLines.find(isLikelyContactLine);
  return line ?? null;
}

function isLikelyContactLine(line: string) {
  return /@|linkedin\.com|github\.com|https?:\/\/|\+\d/i.test(line);
}

function splitInlineSectionHeadings(line: string): string[] {
  if (getCanonicalSectionTitle(line)) {
    return [line];
  }

  for (const sectionTitleAlias of sectionTitleAliases) {
    const match = new RegExp(String.raw`(^|\s)(${escapeRegExp(sectionTitleAlias)})(?=\s|$)`, "i").exec(line);

    if (!match || match.index === undefined || !hasSectionHeadingCasing(match[2])) {
      continue;
    }

    const matchStart = match.index + match[1].length;
    const matchEnd = matchStart + match[2].length;
    const before = line.slice(0, matchStart).trim();
    const after = line.slice(matchEnd).trim();

    if (!before && after.startsWith(":")) {
      continue;
    }

    if (before && !/[.!?:;]$/.test(before)) {
      continue;
    }

    return [
      ...(before ? splitInlineSectionHeadings(before) : []),
      match[2],
      ...(after ? splitInlineSectionHeadings(after) : [])
    ];
  }

  return [line];
}

function splitInlineDatedDescriptions(line: string): string[] {
  const matches = [...line.matchAll(parenthesizedDatedDescriptionPattern)];

  if (matches.length === 0) {
    return [line];
  }

  const lines: string[] = [];
  const prefix = line.slice(0, matches[0].index).trim();

  if (prefix) {
    lines.push(prefix);
  }

  for (const [matchIndex, match] of matches.entries()) {
    if (match.index === undefined) {
      continue;
    }

    const title = match[2].trim();
    const dateRange = normalizeDateRange(match[3]);
    const descriptionStart = match.index + match[0].length;
    const descriptionEnd = matches[matchIndex + 1]?.index ?? line.length;
    const description = line.slice(descriptionStart, descriptionEnd).trim();

    if (title && dateRange) {
      lines.push(`${title} ${dateRange}`);
    }

    if (description) {
      lines.push(`• ${description}`);
    }
  }

  return lines;
}

function hasSectionHeadingCasing(value: string) {
  return value === value.toUpperCase() || value === toTitleCase(value);
}

function toTitleCase(value: string) {
  return value.replace(/\b[a-z]/g, (character) => character.toUpperCase());
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseResumeSections(lines: string[]) {
  const sections: ParsedResumeSection[] = [];
  let currentSectionTitle: string | null = null;
  let currentSectionLines: string[] = [];

  for (const line of lines) {
    const sectionTitle = getCanonicalSectionTitle(line);

    if (sectionTitle) {
      if (currentSectionTitle) {
        sections.push(parseResumeSection(currentSectionTitle, currentSectionLines));
      }

      currentSectionTitle = sectionTitle;
      currentSectionLines = [];
      continue;
    }

    if (currentSectionTitle) {
      currentSectionLines.push(line);
    }
  }

  if (currentSectionTitle) {
    sections.push(parseResumeSection(currentSectionTitle, currentSectionLines));
  }

  return sections;
}

function parseResumeSection(title: string, lines: string[]): ParsedResumeSection {
  const blocks: ParsedResumeBlock[] = [];
  let currentEntry: ParsedResumeEntryBlock | null = null;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const nextLine = lines[lineIndex + 1] ?? null;
    const skill = parseSkillLine(line);
    if (isSkillsSection(title) && skill) {
      flushCurrentEntry(blocks, currentEntry);
      currentEntry = null;
      blocks.push(skill);
      continue;
    }

    if (isBulletLine(line)) {
      if (!currentEntry) {
        currentEntry = takeTrailingParagraphAsEntry(blocks) ?? {
          type: "entry",
          title,
          subtitle: null,
          dateRange: null,
          bullets: []
        };
      }

      currentEntry.bullets.push(cleanBulletLine(line));
      continue;
    }

    const datedHeader = splitDatedHeader(line);
    if (datedHeader) {
      flushCurrentEntry(blocks, currentEntry);
      currentEntry = {
        type: "entry",
        title: datedHeader.title,
        subtitle: null,
        dateRange: datedHeader.dateRange,
        bullets: []
      };
      continue;
    }

    const dateOnly = parseDateOnlyLine(line);
    if (dateOnly) {
      const previousEntry = takeTrailingParagraphAsEntry(blocks);

      if (previousEntry) {
        flushCurrentEntry(blocks, currentEntry);
        currentEntry = {
          ...previousEntry,
          dateRange: dateOnly
        };
        continue;
      }
    }

    const undatedProjectHeader = parseUndatedProjectHeader(title, line, nextLine, currentEntry);
    if (undatedProjectHeader) {
      flushCurrentEntry(blocks, currentEntry);
      currentEntry = undatedProjectHeader;
      continue;
    }

    if (currentEntry) {
      if (shouldStartInferredBullet(line, currentEntry)) {
        currentEntry.bullets.push(line);
        continue;
      }

      if (currentEntry.bullets.length > 0) {
        currentEntry.bullets[currentEntry.bullets.length - 1] = `${currentEntry.bullets[currentEntry.bullets.length - 1]} ${line}`;
      } else if (currentEntry.subtitle) {
        currentEntry.subtitle = `${currentEntry.subtitle} ${line}`;
      } else {
        currentEntry.subtitle = line;
      }

      continue;
    }

    blocks.push({
      type: "paragraph",
      text: line
    });
  }

  flushCurrentEntry(blocks, currentEntry);

  return {
    title,
    blocks
  };
}

function takeTrailingParagraphAsEntry(blocks: ParsedResumeBlock[]): ParsedResumeEntryBlock | null {
  const previousBlock = blocks.at(-1);

  if (!previousBlock || previousBlock.type !== "paragraph") {
    return null;
  }

  blocks.pop();

  return {
    type: "entry",
    title: previousBlock.text,
    subtitle: null,
    dateRange: null,
    bullets: []
  };
}

function flushCurrentEntry(blocks: ParsedResumeBlock[], currentEntry: ParsedResumeEntryBlock | null) {
  if (currentEntry) {
    blocks.push(currentEntry);
  }
}

function getCanonicalSectionTitle(line: string) {
  return canonicalSectionTitles.get(normalizeSectionTitle(line)) ?? inferStandaloneSectionTitle(line);
}

function normalizeSectionTitle(line: string) {
  return normalizePdfSpacedHeading(line.toLowerCase().replace(/[:]+$/g, "").replace(/\s+/g, " ").trim());
}

function normalizePdfSpacedHeading(line: string) {
  return line.replace(/\b([a-z])\s+([a-z]{2,})\b/g, "$1$2");
}

function inferStandaloneSectionTitle(line: string) {
  const normalizedLine = line.replace(/[:]+$/g, "").replace(/\s+/g, " ").trim();

  if (!isLikelyStandaloneSectionTitle(normalizedLine)) {
    return null;
  }

  return formatInferredSectionTitle(normalizedLine);
}

function isLikelyStandaloneSectionTitle(line: string) {
  if (line.length < 3 || line.length > 60) {
    return false;
  }

  if (
    isBulletLine(line) ||
    isLikelyContactLine(line) ||
    parseDateOnlyLine(line) ||
    splitDatedHeader(line) ||
    /[.!?]$/.test(line) ||
    /:\s*\S/.test(line)
  ) {
    return false;
  }

  if (!standaloneSectionKeywordPattern.test(line) || !hasStandaloneSectionHeadingCasing(line)) {
    return false;
  }

  return standaloneSectionConnectorPattern.test(line) || standaloneSectionEndingPattern.test(line);
}

function hasStandaloneSectionHeadingCasing(line: string) {
  const normalizedLine = line.replace(/\s*[&/]\s*/g, " ").trim();

  if (normalizedLine === normalizedLine.toUpperCase()) {
    return true;
  }

  return normalizedLine.split(/\s+/).every((word) => isSectionHeadingConnector(word) || startsWithUppercaseLetter(word));
}

function isSectionHeadingConnector(word: string) {
  return /^(?:and|or|of|for|in|the)$/i.test(word);
}

function startsWithUppercaseLetter(word: string) {
  const firstLetter = word.match(/[a-z]/i)?.[0];

  if (!firstLetter) {
    return true;
  }

  return firstLetter === firstLetter.toUpperCase();
}

function formatInferredSectionTitle(line: string) {
  return toTitleCase(line.toLowerCase())
    .replace(/\bAnd\b/g, "and")
    .replace(/\bOr\b/g, "or")
    .replace(/\bOf\b/g, "of")
    .replace(/\bFor\b/g, "for")
    .replace(/\bIn\b/g, "in")
    .replace(/\bThe\b/g, "the")
    .replace(/\s*&\s*/g, " & ")
    .replace(/\s*\/\s*/g, " / ");
}

function isSkillsSection(title: string) {
  return normalizeSectionTitle(title).includes("skills");
}

function isProjectsSection(title: string) {
  return normalizeSectionTitle(title).includes("project");
}

function parseUndatedProjectHeader(
  sectionTitle: string,
  line: string,
  nextLine: string | null,
  currentEntry: ParsedResumeEntryBlock | null
): ParsedResumeEntryBlock | null {
  if (!isProjectsSection(sectionTitle) || !nextLine || !isBulletLine(nextLine)) {
    return null;
  }

  if (currentEntry && currentEntry.bullets.length === 0) {
    return null;
  }

  if (!isLikelyUndatedProjectHeader(line)) {
    return null;
  }

  const { title, subtitle } = splitProjectTitleAndStack(line);

  return {
    type: "entry",
    title,
    subtitle,
    dateRange: null,
    bullets: []
  };
}

function isLikelyUndatedProjectHeader(line: string) {
  const trimmedLine = line.trim();

  if (
    trimmedLine.length < 2 ||
    trimmedLine.length > 140 ||
    isBulletLine(trimmedLine) ||
    isLikelyContactLine(trimmedLine) ||
    parseDateOnlyLine(trimmedLine) ||
    splitDatedHeader(trimmedLine) ||
    /[.!?]$/.test(trimmedLine) ||
    startsWithLowercaseLetter(trimmedLine)
  ) {
    return false;
  }

  if (trimmedLine.includes("|")) {
    return true;
  }

  return trimmedLine.split(/\s+/).length <= 10;
}

function splitProjectTitleAndStack(line: string) {
  const [title, ...stackParts] = line.split("|").map((part) => part.trim());
  const subtitle = stackParts.join(" | ").trim();

  return {
    title: title || line.trim(),
    subtitle: subtitle || null
  };
}

function parseSkillLine(line: string): ParsedResumeSkillBlock | null {
  const match = line.match(/^([^:]{2,40})\s*:\s*(.+)$/);

  if (!match) {
    return null;
  }

  return {
    type: "skill",
    label: match[1].trim(),
    value: match[2].trim()
  };
}

function splitDatedHeader(line: string) {
  const matches = [...line.matchAll(dateHeaderPattern)];
  const lastMatch = matches.at(-1);

  if (!lastMatch || lastMatch.index === undefined) {
    return null;
  }

  const remainingText = line.slice(lastMatch.index + lastMatch[0].length).trim();
  if (remainingText && !/^[,.;:)]+$/.test(remainingText)) {
    return null;
  }

  const title = line.slice(0, lastMatch.index).trim();

  if (!title) {
    return null;
  }

  return {
    title,
    dateRange: normalizeDateRange(lastMatch[0])
  };
}

function parseDateOnlyLine(line: string) {
  const matches = [...line.matchAll(dateHeaderPattern)];

  if (matches.length !== 1) {
    return null;
  }

  const match = matches[0];
  if (match.index !== 0 || match[0].length !== line.trim().length) {
    return null;
  }

  return normalizeDateRange(match[0]);
}

function normalizeDateRange(value: string) {
  return value
    .replace(/\s*[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]\s*/g, " - ")
    .replace(/\s+(?:to|through|until)\s+/gi, " - ")
    .replace(/\s+-\s+/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBulletLine(line: string) {
  return bulletPattern.test(line);
}

function cleanBulletLine(line: string) {
  return line.replace(bulletPattern, "").trim();
}

function shouldStartInferredBullet(line: string, currentEntry: ParsedResumeEntryBlock) {
  if (!currentEntry.subtitle || !isLikelyBulletParagraphStart(line)) {
    return false;
  }

  if (currentEntry.bullets.length === 0) {
    return true;
  }

  return !shouldContinuePreviousBullet(line, currentEntry.bullets[currentEntry.bullets.length - 1]);
}

function isLikelyBulletParagraphStart(line: string) {
  return resumeBulletLeadPattern.test(line);
}

function shouldContinuePreviousBullet(line: string, previousBullet: string) {
  return startsWithLowercaseLetter(line) || /(?:,|:|;|\b(?:and|as|for|in|including|of|to|using|with))$/i.test(previousBullet);
}

function startsWithLowercaseLetter(line: string) {
  const firstCharacter = line.trim().charAt(0);
  return firstCharacter.toLocaleLowerCase() === firstCharacter && firstCharacter.toLocaleUpperCase() !== firstCharacter;
}

function getEntryMetadataMarkdown(entry: ParsedResumeEntryBlock) {
  if (entry.subtitle && entry.dateRange) {
    return `#### ${entry.subtitle} | ${entry.dateRange}`;
  }

  if (entry.subtitle) {
    return `#### ${entry.subtitle}`;
  }

  return entry.dateRange ? `#### ${entry.dateRange}` : "";
}

function getResumeParseWarnings(lines: string[], document: ParsedResumeDocument) {
  const warnings = new Set<ResumeParseWarning>();
  const bulletCount = document.sections.reduce(
    (total, section) =>
      total +
      section.blocks.reduce((sectionTotal, block) => sectionTotal + (block.type === "entry" ? block.bullets.length : 0), 0),
    0
  );
  const entryCount = document.sections.reduce(
    (total, section) => total + section.blocks.filter((block) => block.type === "entry").length,
    0
  );

  if (document.sections.length === 0) {
    warnings.add("missing_sections");
  }

  if (bulletCount === 0) {
    warnings.add("missing_bullets");
  }

  if (hasManyShortLines(lines)) {
    warnings.add("many_short_lines");
  }

  if (hasGarbledText(lines.join(" "))) {
    warnings.add("garbled_text");
  }

  if (document.sections.length < 2 || entryCount === 0 || warnings.has("garbled_text")) {
    warnings.add("low_structure_confidence");
  }

  return [...warnings];
}

function hasManyShortLines(lines: string[]) {
  if (lines.length < 16) {
    return false;
  }

  const shortLineCount = lines.filter((line) => line.length <= 12).length;
  return shortLineCount / lines.length > 0.4;
}

function hasGarbledText(text: string) {
  if (text.length < 24) {
    return false;
  }

  const replacementCharacterCount = [...text].filter((character) => character === "\ufffd").length;
  const suspiciousSpacingCount = (text.match(/\b\w\s+\w\s+\w\b/g) ?? []).length;
  return replacementCharacterCount > 0 || suspiciousSpacingCount > 8;
}

function getResumeParseConfidence(warnings: ResumeParseWarning[]) {
  const penaltyByWarning: Record<ResumeParseWarning, number> = {
    empty_text: 1,
    missing_sections: 0.3,
    missing_bullets: 0.18,
    many_short_lines: 0.16,
    garbled_text: 0.35,
    low_structure_confidence: 0.22
  };
  const penalty = warnings.reduce((total, warning) => total + penaltyByWarning[warning], 0);

  return Math.max(0, Math.min(1, Number((1 - penalty).toFixed(2))));
}
