import { memo, useEffect, useState } from "react";
import { Button, Loading, Tile } from "@carbon/react";
import { Launch } from "@carbon/icons-react";
import type { JobPostingDto, OfficeImageSearchDto } from "../../../../shared/src/index";
import { getOfficeImages } from "../../api";
import { formatDate } from "../../utils/format";

function isRemoteLocation(location: string) {
  return /\b(remote|virtual|anywhere|worldwide)\b/i.test(location);
}

function getOfficeImageLocation(posting: JobPostingDto) {
  return posting.locations.find((location) => !isRemoteLocation(location));
}

const OfficeImagePanel = memo(function OfficeImagePanel({ company, location }: { company: string; location?: string }) {
  const [imageSearch, setImageSearch] = useState<OfficeImageSearchDto | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();

    setImageSearch(null);
    setImageError(null);
    setIsImageLoading(true);

    void getOfficeImages(company, location)
      .then((result) => {
        if (!abortController.signal.aborted) {
          setImageSearch(result);
        }
      })
      .catch((error: unknown) => {
        if (!abortController.signal.aborted) {
          setImageError(error instanceof Error ? error.message : "Office image unavailable.");
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsImageLoading(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [company, location]);

  const officeImage = imageSearch?.images[0] ?? null;
  const imageSource = officeImage?.thumbnailUrl ?? officeImage?.imageUrl ?? null;

  return (
    <div className="office-image-panel">
      <div className="office-image-frame">
        {imageSource ? (
          <img src={imageSource} alt={officeImage?.title ?? `${company} office`} loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <div className="office-image-placeholder">
            {isImageLoading ? (
              <Loading small withOverlay={false} description="Searching office images" />
            ) : (
              <span>{imageError ?? "No office image found"}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export const VisualizationPanel = memo(function VisualizationPanel({ posting }: { posting: JobPostingDto | null }) {
  if (!posting) {
    return (
      <Tile className="visualization-tile">
        <div className="visualization-empty">
          <p>No posting selected.</p>
          <span>Select a posting to inspect its location and application details.</span>
        </div>
      </Tile>
    );
  }

  const officeImageLocation = getOfficeImageLocation(posting);
  const detailRows = [
    { label: "Category", value: posting.category },
    { label: "Season", value: posting.season },
    { label: "Age", value: posting.ageText ?? "Age unavailable" },
    { label: "Status", value: posting.isClosed ? "Closed" : posting.isActive ? "Active" : "Inactive" },
    { label: "First", value: formatDate(posting.firstSeenAt) },
    { label: "Last", value: formatDate(posting.lastSeenAt) },
    ...(posting.doesNotOfferSponsorship ? [{ label: "Sponsorship", value: "Does not offer sponsorship" }] : []),
    ...(posting.requiresUsCitizenship ? [{ label: "Citizenship", value: "US citizenship required" }] : [])
  ];

  return (
    <Tile className="visualization-tile">
      <OfficeImagePanel company={posting.company} location={officeImageLocation} />

      <div className="posting-detail-card">
        <div className="posting-detail-card__header">
          <h3>{posting.company}</h3>
          <p>{posting.role}</p>
          <span>{posting.locations.join(" | ") || "Location unavailable"}</span>
        </div>

        <dl className="posting-detail-grid">
          {detailRows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="detail-actions">
        {posting.applicationUrls.map((url, index) => (
          <Button kind={index === 0 ? "primary" : "ghost"} size="sm" renderIcon={Launch} href={url} target="_blank" key={url}>
            {index === 0 ? "Apply" : `Link ${index + 1}`}
          </Button>
        ))}
        {posting.simplifyUrl ? (
          <Button kind="ghost" size="sm" renderIcon={Launch} href={posting.simplifyUrl} target="_blank">
            Simplify
          </Button>
        ) : null}
      </div>
    </Tile>
  );
});
