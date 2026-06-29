import type { JobPostingDto } from "../../../../shared/src/index";
import type { PostingFacetFilter, PostingTagFilter } from "../../types/app";

export const postingTagFilters: PostingTagFilter[] = [
  { id: "new", label: "New", matches: (posting) => posting.isNewToday },
  { id: "followed", label: "Followed", matches: (posting) => posting.isFollowed },
  { id: "tracked", label: "Tracked", matches: (posting) => posting.isTracked },
  { id: "faang", label: "FAANG+", matches: (posting) => posting.isFaang },
  { id: "advanced-degree", label: "Advanced degree", matches: (posting) => posting.requiresAdvancedDegree }
];

export const sponsorshipFilters: PostingFacetFilter[] = [
  { id: "no-sponsorship", label: "Does not offer sponsorship", matches: (posting) => posting.doesNotOfferSponsorship }
];

export const citizenshipFilters: PostingFacetFilter[] = [
  { id: "us-citizenship", label: "US citizenship required", matches: (posting) => posting.requiresUsCitizenship }
];

function normalizeFilterText(value: string) {
  return value.trim().toLowerCase();
}

export function matchesPostingFilters(
  posting: JobPostingDto,
  filters: {
    search: string;
    categories: string[];
    location: string;
    tags: PostingTagFilter[];
    sponsorship: PostingFacetFilter[];
    citizenship: PostingFacetFilter[];
  }
) {
  const searchTerm = normalizeFilterText(filters.search);
  const locationTerm = normalizeFilterText(filters.location);

  if (filters.categories.length > 0 && !filters.categories.includes(posting.category)) {
    return false;
  }

  if (filters.tags.some((tagFilter) => !tagFilter.matches(posting))) {
    return false;
  }

  if (filters.sponsorship.length > 0 && !filters.sponsorship.some((filter) => filter.matches(posting))) {
    return false;
  }

  if (filters.citizenship.length > 0 && !filters.citizenship.some((filter) => filter.matches(posting))) {
    return false;
  }

  if (locationTerm && !normalizeFilterText(posting.locations.join(" ")).includes(locationTerm)) {
    return false;
  }

  if (!searchTerm) {
    return true;
  }

  return normalizeFilterText(`${posting.company} ${posting.role} ${posting.category}`).includes(searchTerm);
}
