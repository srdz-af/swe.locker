import { describe, expect, it } from "vitest";
import { canonicalizeUrl, normalizeCompanyName } from "../domain/normalize.js";
import { parseSimplifyJobsReadme } from "./simplifyJobsParser.js";
import { getSourceDefinitions } from "../sources/sourceDefinitions.js";

const fixture = `
## 💻 Software Engineering Internship Roles

<table>
<thead>
<tr>
<th>Company</th>
<th>Role</th>
<th>Location</th>
<th>Application</th>
<th>Age</th>
</tr>
</thead>
<tbody>
<tr>
<td>🔥 <strong><a href="https://simplify.jobs/c/Acme">Acme</a></strong></td>
<td>Software Engineer Intern 🎓</td>
<td>New York, NY<br>Remote in USA</td>
<td><a href="https://jobs.example.com/acme?utm_source=Simplify&ref=Simplify">Apply</a> <a href="https://simplify.jobs/p/acme-1?utm_source=GHList">Simplify</a></td>
<td>0d</td>
</tr>
<tr>
<td>↳</td>
<td>Backend Intern 🛂</td>
<td>Boston, MA</td>
<td><a href="https://jobs.example.com/acme-backend?utm_medium=list">Apply</a></td>
<td>1d</td>
</tr>
</tbody>
</table>

## 🤖 Data Science, AI & Machine Learning Internship Roles

<table>
<thead>
<tr>
<th>Company</th>
<th>Role</th>
<th>Location</th>
<th>Application</th>
<th>Age</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>DataCo</strong></td>
<td>ML Intern 🇺🇸</td>
<td>SF</td>
<td><a href="https://jobs.example.com/data">Apply</a></td>
<td>2d</td>
</tr>
</tbody>
</table>
`;

describe("parseSimplifyJobsReadme", () => {
  it("parses HTML tables by category", () => {
    const postings = parseSimplifyJobsReadme(fixture, "Summer 2026");

    expect(postings).toHaveLength(3);
    expect(postings[0]?.category).toBe("Software Engineering");
    expect(postings[2]?.category).toBe("Data Science, AI & Machine Learning");
  });

  it("carries company names through continuation rows", () => {
    const postings = parseSimplifyJobsReadme(fixture, "Summer 2026");

    expect(postings[1]?.company).toBe("Acme");
    expect(postings[1]?.role).toBe("Backend Intern");
    expect(postings[1]?.doesNotOfferSponsorship).toBe(true);
  });

  it("extracts links, locations, and metadata", () => {
    const [posting] = parseSimplifyJobsReadme(fixture, "Summer 2026");

    expect(posting?.locations).toEqual(["New York, NY", "Remote in USA"]);
    expect(posting?.primaryApplicationUrl).toBe("https://jobs.example.com/acme?utm_source=Simplify&ref=Simplify");
    expect(posting?.simplifyUrl).toBe("https://simplify.jobs/p/acme-1?utm_source=GHList");
    expect(posting?.isFaang).toBe(true);
    expect(posting?.requiresAdvancedDegree).toBe(true);
  });

  it("uses source table schemas for off-season tables with a term column", () => {
    const offSeasonSource = getSourceDefinitions().find((sourceDefinition) =>
      sourceDefinition.sourceKey.endsWith("off-season")
    );
    const postings = parseSimplifyJobsReadme(
      `
## 💻 Software Engineering Internship Roles

<table>
<thead>
<tr>
<th>Company</th>
<th>Role</th>
<th>Location</th>
<th>Term</th>
<th>Application</th>
<th>Age</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>Acme</strong></td>
<td>Software Engineer Intern</td>
<td>New York, NY</td>
<td>Fall 2026</td>
<td><a href="https://jobs.example.com/acme">Apply</a></td>
<td>3d</td>
</tr>
</tbody>
</table>
`,
      "Summer 2026",
      {
        tableSchema: offSeasonSource?.tableSchema
      }
    );

    expect(postings).toHaveLength(1);
    expect(postings[0]?.primaryApplicationUrl).toBe("https://jobs.example.com/acme");
    expect(postings[0]?.ageText).toBe("3d");
    expect(postings[0]?.isClosed).toBe(false);
  });
});

describe("source definitions", () => {
  it("defines the three SimplifyJobs sources", () => {
    const sourceDefinitions = getSourceDefinitions();

    expect(sourceDefinitions.map((sourceDefinition) => sourceDefinition.sourceKey)).toEqual([
      "simplifyjobs-summer-internships",
      "simplifyjobs-summer-internships-off-season",
      "simplifyjobs-summer-internships-inactive"
    ]);
    expect(sourceDefinitions.map((sourceDefinition) => sourceDefinition.includeClosedPostings)).toEqual([
      false,
      false,
      true
    ]);
    expect(sourceDefinitions.map((sourceDefinition) => sourceDefinition.repositoryFilePath)).toEqual([
      "README.md",
      "README-Off-Season.md",
      "README-Inactive.md"
    ]);
    expect(new Set(sourceDefinitions.map((sourceDefinition) => sourceDefinition.repositoryCloneUrl)).size).toBe(1);
    expect(new Set(sourceDefinitions.map((sourceDefinition) => sourceDefinition.repositoryBranch))).toEqual(
      new Set(["dev"])
    );
  });
});

describe("normalizers", () => {
  it("normalizes company names and tracking URLs", () => {
    expect(normalizeCompanyName("🔥 ACI Worldwide ")).toBe("aci worldwide");
    expect(canonicalizeUrl("https://jobs.example.com/acme?utm_source=Simplify&ref=Simplify&id=1")).toBe(
      "https://jobs.example.com/acme?id=1"
    );
  });
});
