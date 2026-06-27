import { describe, expect, it } from "vitest";
import { canonicalizeUrl, normalizeCompanyName } from "../domain/normalize.js";
import { parseSimplifyJobsReadme } from "./simplifyJobsParser.js";

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
});

describe("normalizers", () => {
  it("normalizes company names and tracking URLs", () => {
    expect(normalizeCompanyName("🔥 ACI Worldwide ")).toBe("aci worldwide");
    expect(canonicalizeUrl("https://jobs.example.com/acme?utm_source=Simplify&ref=Simplify&id=1")).toBe(
      "https://jobs.example.com/acme?id=1"
    );
  });
});
