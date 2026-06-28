import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildOfficeImageQuery, searchOfficeImages } from "./officeImageService.js";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

describe("officeImageService", () => {
  it("builds office image queries from company and location", () => {
    expect(buildOfficeImageQuery("  IBM  ", " New York, NY ")).toBe("IBM offices New York, NY");
    expect(buildOfficeImageQuery("IBM", null)).toBe("IBM offices");
  });

  it("returns mapped image candidates", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response("<script>var vqd='token-123';</script>", {
          status: 200
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          results: [
            {
              title: "IBM office",
              image: "https://images.example.com/ibm.jpg",
              thumbnail: "https://images.example.com/ibm-thumb.jpg",
              url: "https://source.example.com/ibm",
              source: "Example",
              width: 1200,
              height: 800
            },
            {
              title: "Bad image",
              image: "javascript:alert(1)"
            }
          ]
        })
      );

    await expect(searchOfficeImages({ company: "IBM", location: "New York" })).resolves.toEqual({
      query: "IBM offices New York",
      searchUrl: "https://duckduckgo.com/?q=IBM+offices+New+York&iax=images&ia=images",
      images: [
        {
          title: "IBM office",
          imageUrl: "https://images.example.com/ibm.jpg",
          thumbnailUrl: "https://images.example.com/ibm-thumb.jpg",
          sourceUrl: "https://source.example.com/ibm",
          sourceName: "Example",
          width: 1200,
          height: 800
        }
      ]
    });
  });

  it("returns an empty result when search fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Search unavailable"));

    await expect(searchOfficeImages({ company: "Acme" })).resolves.toEqual({
      query: "Acme offices",
      searchUrl: "https://duckduckgo.com/?q=Acme+offices&iax=images&ia=images",
      images: []
    });
  });
});
