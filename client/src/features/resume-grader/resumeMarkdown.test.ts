import { describe, expect, it } from "vitest";
import { parseResumeMarkdownModel, renderResumeMarkdown } from "./resumeMarkdown";

const sampleResumeText = `Sergio Rodriguez Alfaro
Software Engineer Intern
Merida, Mexico | +52 999 136 8824 | srdz.af@gmail.com | linkedin.com/in/srdzzz | github.com/srdz-af
Experience
Microsoft Corporation Feb 2026 \u2013 Aug 2026
Software Engineering Intern
\u2022 Design a dead-letter queue and bounded-retry architecture for a distributed Azure consumer, isolating poison and
malformed messages to improve fault isolation and service reliability
\u2022 Define failure-classification and observability strategy for asynchronous experiment-sync processing, separating
retryable and non-retryable errors and enabling operator response through telemetry, alerts, and replay workflows
Uber Technologies, Inc. Feb 2023 \u2013 Aug 2023
Uber Career Prep, Software Engineering Fellowship
\u2022 Selected from over 1200 international applicants (2% acceptance) to a program for international students, with
technical workshops and software engineering tasks in data structures and algorithms with weekly peer-to-peer
mentorship by Uber software engineers
Projects
tsnl Dec 2025 \u2013 Present
Graph Neural Network inductive model for relation prediction between any two real world entities
\u2022 Designed and implemented a from-scratch GraphSAGE pipeline in C++, including CSR graph storage, scaling to
170M nodes / 1.1B edges with 2-layer inductive inference
Technical Skills
Technologies : C, C++, Java, Python, SQL, NodeJS, Typescript, Bash, Git, Linux, React
Languages : English, Fluent; Spanish, Native`;

describe("resumeMarkdown", () => {
  it("parses a structured plain-text resume into sections and entries", () => {
    const document = parseResumeMarkdownModel(sampleResumeText);
    const experience = document.sections.find((section) => section.title === "Experience");
    const projects = document.sections.find((section) => section.title === "Projects");
    const skills = document.sections.find((section) => section.title === "Technical Skills");
    const microsoft = experience?.blocks[0];
    const firstMicrosoftBullet = microsoft?.type === "entry" ? microsoft.bullets[0] : "";

    expect(document.name).toBe("Sergio Rodriguez Alfaro");
    expect(document.headline).toBe("Software Engineer Intern");
    expect(document.contact).toContain("github.com/srdz-af");
    expect(document.warnings).not.toContain("missing_sections");
    expect(document.confidence).toBeGreaterThan(0.7);
    expect(experience?.blocks).toHaveLength(2);
    expect(projects?.blocks).toHaveLength(1);
    expect(skills?.blocks).toHaveLength(2);

    expect(microsoft).toMatchObject({
      type: "entry",
      title: "Microsoft Corporation",
      subtitle: "Software Engineering Intern",
      dateRange: "Feb 2026 - Aug 2026"
    });
    expect(firstMicrosoftBullet).toContain("poison and malformed messages");
  });

  it("renders the parsed model as readable markdown", () => {
    const markdown = renderResumeMarkdown(parseResumeMarkdownModel(sampleResumeText));

    expect(markdown).toContain("# Sergio Rodriguez Alfaro");
    expect(markdown).toContain("**Software Engineer Intern**  \nMerida, Mexico");
    expect(markdown).toContain("## Experience\n\n---");
    expect(markdown).toContain("### Microsoft Corporation");
    expect(markdown).toContain("#### Software Engineering Intern | Feb 2026 - Aug 2026");
    expect(markdown).toContain("- Design a dead-letter queue");
    expect(markdown).toContain("**Technologies:** C, C++, Java");
  });

  it("infers bullets from action-led paragraphs when bullet glyphs are missing", () => {
    const document = parseResumeMarkdownModel(`Sergio Rodriguez Alfaro
Software Engineer Intern
Merida, Mexico | srdz.af@gmail.com
Experience
Microsoft Corporation Feb 2026 - Aug 2026
Software Engineering Intern
Design a dead-letter queue and bounded-retry architecture for a distributed Azure consumer, isolating poison and
malformed messages to improve fault isolation and service reliability
Define failure-classification and observability strategy for asynchronous experiment-sync processing, separating
retryable and non-retryable errors and enabling operator response through telemetry, alerts, and replay workflows`);
    const markdown = renderResumeMarkdown(document);
    const experience = document.sections[0];
    const microsoft = experience.blocks[0];

    expect(microsoft).toMatchObject({
      type: "entry",
      subtitle: "Software Engineering Intern",
      bullets: [
        expect.stringContaining("malformed messages"),
        expect.stringContaining("retryable and non-retryable errors")
      ]
    });
    expect(markdown).toContain("- Design a dead-letter queue");
    expect(markdown).toContain("- Define failure-classification");
  });

  it("preserves explicit bullet glyphs even when spacing is missing", () => {
    const markdown = renderResumeMarkdown(
      parseResumeMarkdownModel(`Sergio Rodriguez Alfaro
Software Engineer Intern
Merida, Mexico | srdz.af@gmail.com
Experience
Microsoft Corporation Feb 2026 - Aug 2026
Software Engineering Intern
\u2022Define failure-classification and observability strategy`)
    );

    expect(markdown).toContain("- Define failure-classification");
  });

  it("parses awards entries with multi-year and single-date headers", () => {
    const document = parseResumeMarkdownModel(`Sergio Rodriguez Alfaro
Software Engineer Intern
Merida, Mexico | srdz.af@gmail.com
AWARDS
International Collegiate Programming Contest (ICPC, Mexico) 2023 & 2024 & Present
\u2022 Placed 79th out of 500 teams (2023) and 193rd out of 500 teams (2024) in national competitions.
\u2022 Solved algorithmic problems in team-based competitive setting using C++ , applying data structures, graph theory, dynamic
programming and number theory under time constraints.
Programming Community Cup (Google & OmegaUp, LATAM) June 2024
\u2022 Ranked 167th out of 475 participants and 10th among women in LATAM in individual programming contest.
National Association of Information Technology Education Institutions (ANIEI, Mexico) November 2023
\u2022 Achieved 22nd out of 100 teams at the national level.
LEADERSHIP & VOLUNTEERING
Community Mentor 2024 & Present
\u2022 Coached students in algorithms.
PROFESSIONAL DEVELOPMENT
Google Tech Exchange 2024
\u2022 Completed software engineering coursework.`);
    const markdown = renderResumeMarkdown(document);
    const awards = document.sections.find((section) => section.title === "Awards");
    const leadership = document.sections.find((section) => section.title === "Leadership & Volunteering");
    const professionalDevelopment = document.sections.find((section) => section.title === "Professional Development");

    expect(awards?.blocks).toHaveLength(3);
    expect(awards?.blocks[0]).toMatchObject({
      type: "entry",
      title: "International Collegiate Programming Contest (ICPC, Mexico)",
      dateRange: "2023 & 2024 & Present",
      bullets: [
        expect.stringContaining("Placed 79th"),
        expect.stringContaining("dynamic programming and number theory")
      ]
    });
    expect(awards?.blocks[1]).toMatchObject({
      type: "entry",
      title: "Programming Community Cup (Google & OmegaUp, LATAM)",
      dateRange: "June 2024",
      bullets: [expect.stringContaining("Ranked 167th")]
    });
    expect(awards?.blocks[2]).toMatchObject({
      type: "entry",
      title: "National Association of Information Technology Education Institutions (ANIEI, Mexico)",
      dateRange: "November 2023",
      bullets: [expect.stringContaining("Achieved 22nd")]
    });
    expect(leadership?.blocks[0]).toMatchObject({
      type: "entry",
      title: "Community Mentor",
      dateRange: "2024 & Present",
      bullets: [expect.stringContaining("Coached students")]
    });
    expect(professionalDevelopment?.blocks[0]).toMatchObject({
      type: "entry",
      title: "Google Tech Exchange",
      dateRange: "2024",
      bullets: [expect.stringContaining("Completed software engineering coursework")]
    });
    expect(markdown).toContain("### International Collegiate Programming Contest (ICPC, Mexico)");
    expect(markdown).toContain("- Placed 79th out of 500 teams");
    expect(markdown).toContain("## Leadership & Volunteering");
    expect(markdown).toContain("## Professional Development");
  });

  it("keeps pipe-separated award entries inside their section instead of contact metadata", () => {
    const document = parseResumeMarkdownModel(`Manuel Yahir Basto Martin
+52 9995304665 | manuelyahirbasto@gmail.com | linkedin.com/in/manuel-yahir-basto | github.com/miniyahirpro
Honors and Awards
ICPC World Finalist | International Collegiate Programming Contest Jul. 2024 - Aug. 2025
\u2022 Competed in the 49th ICPC World Finals.`);
    const markdown = renderResumeMarkdown(document);
    const honors = document.sections.find((section) => section.title === "Honors and Awards");

    expect(document.name).toBe("Manuel Yahir Basto Martin");
    expect(document.contact).toContain("manuelyahirbasto@gmail.com");
    expect(document.contact).not.toContain("ICPC World Finalist");
    expect(honors?.blocks[0]).toMatchObject({
      type: "entry",
      title: "ICPC World Finalist | International Collegiate Programming Contest",
      dateRange: "Jul. 2024 - Aug. 2025",
      bullets: [expect.stringContaining("Competed in the 49th ICPC")]
    });
    expect(markdown.indexOf("+52 9995304665")).toBeLessThan(markdown.indexOf("## Honors and Awards"));
    expect(markdown).toContain("### ICPC World Finalist | International Collegiate Programming Contest");
  });

  it("keeps achievements and leadership as a single combined section", () => {
    const document = parseResumeMarkdownModel(`Manuel Yahir Basto Martin
+52 9995304665 | manuelyahirbasto@gmail.com
PROJECTS
Chess Engine
\u2022 Integrated automated legal move analysis using FEN notation and high-speed inference.
ACHIEVEMENTS & LEADERSHIP
\u2022 Honorable Mention - ICPC Grand Prix of Mexico (2022-Present).
\u2022 OOP Instructor - Taught Java, Python, and C# design patterns to 50+ students at ITLag.
SKILLS
Languages: Java, Python, C#`);
    const markdown = renderResumeMarkdown(document);
    const achievements = document.sections.find((section) => section.title === "Achievements & Leadership");

    expect(achievements?.blocks).toHaveLength(1);
    expect(achievements?.blocks[0]).toMatchObject({
      type: "entry",
      title: "Achievements & Leadership",
      bullets: [
        expect.stringContaining("Honorable Mention"),
        expect.stringContaining("OOP Instructor")
      ]
    });
    expect(markdown).toContain("## Achievements & Leadership");
    expect(markdown).not.toContain("## Achievements\n\n& LEADERSHIP");
    expect(markdown).toContain("## Skills");
  });

  it("uses a standalone heading line as one section title before splitting known aliases", () => {
    const document = parseResumeMarkdownModel(`Manuel Yahir Basto Martin
+52 9995304665 | manuelyahirbasto@gmail.com
EXPERIENCE
Software Engineer Intern Uber, Sunnyvale, CA
July 2025 - September 2025
\u2022 Built production data systems.
RESEARCH & PUBLICATIONS
\u2022 Published a technical report on distributed systems.
SKILLS
Languages: Java, Python, C#`);
    const markdown = renderResumeMarkdown(document);
    const research = document.sections.find((section) => section.title === "Research & Publications");

    expect(research?.blocks).toHaveLength(1);
    expect(research?.blocks[0]).toMatchObject({
      type: "entry",
      title: "Research & Publications",
      bullets: [expect.stringContaining("Published a technical report")]
    });
    expect(markdown).toContain("## Research & Publications");
    expect(markdown).not.toContain("## Publications");
  });

  it("normalizes PDF-extracted section headings with split initial letters", () => {
    const document = parseResumeMarkdownModel(`Alfredo Alberto Palacios Rodriguez
\u0083 (+52) 8713950729 | # alfredo.palacios.rod@gmail.com | \u00ef yiyoalfredo | \u00a7 Yiyoxd
S UMMARY
Computer Science student focused on building efficient and reliable software systems.
E DUCATION
Instituto Tecnologico de la Laguna Torreon, Mexico
Bachelor of Science in Computer Science January 2022 - June 2026
W ORK E XPERIENCE
Microsoft Remote
Software Engineer Intern, M365 Core Team Feb 2026 - Present
\u2013 Developing backend services in C# to ingest and correlate user activity signals across Microsoft 365 products.
P ROJECTS
Competitive Math 2 | Kotlin, Jetpack Compose, Android
\u2013 Developed a fast paced mental math app in Kotlin with Jetpack Compose.
T ECHNICAL S KILLS
Programming C++, Python, Java, C#`);
    const markdown = renderResumeMarkdown(document);
    const experience = document.sections.find((section) => section.title === "Experience");
    const projects = document.sections.find((section) => section.title === "Projects");

    expect(document.warnings).not.toContain("missing_sections");
    expect(document.warnings).not.toContain("missing_bullets");
    expect(document.warnings).not.toContain("low_structure_confidence");
    expect(document.sections.map((section) => section.title)).toEqual([
      "Summary",
      "Education",
      "Experience",
      "Projects",
      "Technical Skills"
    ]);
    expect(experience?.blocks[0]).toMatchObject({
      type: "paragraph",
      text: "Microsoft Remote"
    });
    expect(experience?.blocks[1]).toMatchObject({
      type: "entry",
      title: "Software Engineer Intern, M365 Core Team",
      dateRange: "Feb 2026 - Present",
      bullets: [expect.stringContaining("Developing backend services")]
    });
    expect(projects?.blocks[0]).toMatchObject({
      type: "entry",
      title: "Competitive Math 2",
      subtitle: "Kotlin, Jetpack Compose, Android",
      bullets: [expect.stringContaining("fast paced mental math app")]
    });
    expect(markdown).toContain("## Summary");
    expect(markdown).toContain("## Technical Skills");
  });

  it("recognizes common resume date formats", () => {
    const document = parseResumeMarkdownModel(`Sergio Rodriguez Alfaro
Software Engineer Intern
Merida, Mexico | srdz.af@gmail.com
Professional Development
Full Month Program July 2025 - September 2025
\u2022 Completed a full month formatted program.
Unicode Dash Program July 2025 \u2013 September 2025
\u2022 Completed a unicode dash formatted program.
Abbreviated Month Program Jul. 2025 to Sep. 2025
\u2022 Completed an abbreviated month formatted program.
Numeric Month Program 07/2025 - 09/2025
\u2022 Completed a numeric month formatted program.
Seasonal Program Summer 2025
\u2022 Completed a seasonal program.
Quarter Program Q1 2025 - Q2 2025
\u2022 Completed a quarterly program.`);
    const professionalDevelopment = document.sections.find((section) => section.title === "Professional Development");

    expect(professionalDevelopment?.blocks).toEqual([
      expect.objectContaining({
        type: "entry",
        title: "Full Month Program",
        dateRange: "July 2025 - September 2025"
      }),
      expect.objectContaining({
        type: "entry",
        title: "Unicode Dash Program",
        dateRange: "July 2025 - September 2025"
      }),
      expect.objectContaining({
        type: "entry",
        title: "Abbreviated Month Program",
        dateRange: "Jul. 2025 - Sep. 2025"
      }),
      expect.objectContaining({
        type: "entry",
        title: "Numeric Month Program",
        dateRange: "07/2025 - 09/2025"
      }),
      expect.objectContaining({
        type: "entry",
        title: "Seasonal Program",
        dateRange: "Summer 2025"
      }),
      expect.objectContaining({
        type: "entry",
        title: "Quarter Program",
        dateRange: "Q1 2025 - Q2 2025"
      })
    ]);
  });

  it("attaches a date-only line to the previous entry title", () => {
    const document = parseResumeMarkdownModel(`Sergio Rodriguez Alfaro
Software Engineer Intern
Merida, Mexico | srdz.af@gmail.com
Professional Development
Aspire Leaders Program Harvard University, Virtual
October 2025 - December 2025
\u2022 Selected for a global leadership development program, strengthening professional growth.`);
    const markdown = renderResumeMarkdown(document);
    const professionalDevelopment = document.sections.find((section) => section.title === "Professional Development");

    expect(professionalDevelopment?.blocks).toEqual([
      expect.objectContaining({
        type: "entry",
        title: "Aspire Leaders Program Harvard University, Virtual",
        dateRange: "October 2025 - December 2025",
        bullets: [expect.stringContaining("Selected for a global leadership")]
      })
    ]);
    expect(markdown).toContain("### Aspire Leaders Program Harvard University, Virtual");
    expect(markdown).toContain("October 2025 - December 2025");
    expect(markdown).toContain("- Selected for a global leadership");
  });

  it("recognizes full-month date-only ranges with pdf dash characters", () => {
    const document = parseResumeMarkdownModel(`Sergio Rodriguez Alfaro
Software Engineer Intern
Merida, Mexico | srdz.af@gmail.com
Experience
Software Engineer Intern Uber, Sunnyvale, CA, U.S
July 2025 \u2013 September 2025
\u2022 Designed scalable batch and streaming data pipelines.`);
    const experience = document.sections.find((section) => section.title === "Experience");
    const markdown = renderResumeMarkdown(document);

    expect(experience?.blocks[0]).toMatchObject({
      type: "entry",
      title: "Software Engineer Intern Uber, Sunnyvale, CA, U.S",
      dateRange: "July 2025 - September 2025",
      bullets: [expect.stringContaining("Designed scalable")]
    });
    expect(markdown).toContain("July 2025 - September 2025");
  });

  it("splits inline personal projects sections and parenthesized project dates", () => {
    const document = parseResumeMarkdownModel(`Sergio Rodriguez Alfaro
Software Engineer Intern
Merida, Mexico | srdz.af@gmail.com
Experience
Software Engineer Intern Uber, Sunnyvale, CA, U.S
July 2025 - September 2025
\u2022 Designed and implemented scalable batch and streaming data pipelines for near real-time feature generation using Java, Kafka, Hive, and Cassandra, supporting fraud detection systems in rider-driver interactions.
\u2022 Identified a critical bug in legacy Go service during backend migration by analyzing MySQL queries and cross-service behavior, improving system reliability and preventing data inconsistencies. PERSONAL PROJECTS Diskless Linux Server with PXE Boot (2025): Implemented diskless Linux infrastructure using PXE boot, configuring and debugging DHCP, TFTP, and NFS services via command-line tools, enabling network-based system provisioning across multiple clients. ProjectHub (2025): Developed an end-to-end data pipeline to collect, process and analyze large-scale news data using Python.`);
    const experience = document.sections.find((section) => section.title === "Experience");
    const personalProjects = document.sections.find((section) => section.title === "Personal Projects");
    const markdown = renderResumeMarkdown(document);
    const experienceEntry = experience?.blocks[0];

    expect(experienceEntry).toMatchObject({
      type: "entry",
      title: "Software Engineer Intern Uber, Sunnyvale, CA, U.S",
      dateRange: "July 2025 - September 2025",
      bullets: [
        expect.stringContaining("fraud detection systems"),
        expect.not.stringContaining("PERSONAL PROJECTS")
      ]
    });
    expect(personalProjects?.blocks).toEqual([
      expect.objectContaining({
        type: "entry",
        title: "Diskless Linux Server with PXE Boot",
        dateRange: "2025",
        bullets: [expect.stringContaining("Implemented diskless Linux infrastructure")]
      }),
      expect.objectContaining({
        type: "entry",
        title: "ProjectHub",
        dateRange: "2025",
        bullets: [expect.stringContaining("Developed an end-to-end data pipeline")]
      })
    ]);
    expect(markdown).toContain("## Personal Projects");
    expect(markdown).toContain("### Diskless Linux Server with PXE Boot");
    expect(markdown).toContain("- Implemented diskless Linux infrastructure");
  });

  it("starts undated project entries from standalone project lines before bullets", () => {
    const document = parseResumeMarkdownModel(`Manuel Yahir Basto Martin
+52 9995304665 | manuelyahirbasto@gmail.com
Projects
Tec Laguna Interactive Map | Leaflet.js, PHP, QGIS, JavaScript
\u2022 Leading the development of a detailed interactive digital map of the National Technological Institute of Mexico,
Laguna Campus.
\u2022 Architecting custom map tiling using QGIS to render high-resolution campus layouts with Leaflet.js for the frontend.
Poultry Growth Management System
\u2022 Spearheading the initial development phase of an industrial-focused application to monitor and manage chicken growth cycles on farms.
\u2022 Directing the design of a relational database in PostgreSQL to track biometric data, feed efficiency, and environmental variables.`);
    const projects = document.sections.find((section) => section.title === "Projects");
    const markdown = renderResumeMarkdown(document);

    expect(projects?.blocks).toEqual([
      expect.objectContaining({
        type: "entry",
        title: "Tec Laguna Interactive Map",
        subtitle: "Leaflet.js, PHP, QGIS, JavaScript",
        bullets: [
          expect.stringContaining("National Technological Institute of Mexico, Laguna Campus."),
          expect.stringContaining("Architecting custom map tiling")
        ]
      }),
      expect.objectContaining({
        type: "entry",
        title: "Poultry Growth Management System",
        subtitle: null,
        bullets: [
          expect.stringContaining("industrial-focused application"),
          expect.stringContaining("environmental variables")
        ]
      })
    ]);
    expect(markdown).toContain("### Tec Laguna Interactive Map");
    expect(markdown).toContain("#### Leaflet.js, PHP, QGIS, JavaScript");
    expect(markdown).toContain("### Poultry Growth Management System");
    expect(markdown).not.toContain("new students. Poultry Growth Management System");
  });

  it("flags low-confidence text when structure is not recoverable", () => {
    const document = parseResumeMarkdownModel("S e r g i o\nR o d r i g u e z\nPDF text extract failed");

    expect(document.sections).toEqual([]);
    expect(document.warnings).toContain("missing_sections");
    expect(document.warnings).toContain("missing_bullets");
    expect(document.warnings).toContain("low_structure_confidence");
    expect(document.confidence).toBeLessThan(0.5);
  });
});
