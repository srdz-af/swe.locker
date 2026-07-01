import {
  memo,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Button, Tag } from "@carbon/react";
import { Launch, Star, StarFilled } from "@carbon/icons-react";
import type { JobPostingDto } from "../../../../shared/src/index";

const postingListDesktopQuery = "(min-width: 66rem)";
const postingRowHeight = 108;
const postingRowGap = 8;
const postingRowSize = postingRowHeight + postingRowGap;
const postingRowOverscan = 14;

type PostingCardProps = {
  isSelected: boolean;
  posting: JobPostingDto;
  onFollow: (posting: JobPostingDto) => Promise<void>;
  onSelect: (posting: JobPostingDto) => void;
  onTrack: (posting: JobPostingDto) => Promise<void>;
};

const PostingCard = memo(function PostingCard({ isSelected, posting, onFollow, onSelect, onTrack }: PostingCardProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    if (event.target instanceof HTMLElement && event.target.closest("a, button")) {
      return;
    }

    event.preventDefault();
    onSelect(posting);
  }

  return (
    <article
      aria-label={`${posting.company}, ${posting.role}`}
      aria-selected={isSelected}
      className={`posting-card${isSelected ? " posting-card--selected" : ""}`}
      onClick={() => onSelect(posting)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="posting-main">
        <div className="posting-title-line">
          <div className="posting-company">
            <Button
              hasIconOnly
              kind="ghost"
              size="sm"
              renderIcon={posting.isFollowed ? StarFilled : Star}
              iconDescription={posting.isFollowed ? `Unfollow ${posting.company}` : `Follow ${posting.company}`}
              tooltipAlignment="center"
              tooltipPosition="right"
              onClick={(event) => {
                event.stopPropagation();
                void onFollow(posting);
              }}
            />
            <h3>{posting.company}</h3>
          </div>
          <div className="posting-tags">
            {posting.isNewToday ? <Tag type="gray">New</Tag> : null}
            {posting.isFollowed ? <Tag type="gray">Followed</Tag> : null}
            {posting.isTracked ? <Tag type="gray">Tracked</Tag> : null}
            {posting.isFaang ? <Tag type="gray">FAANG+</Tag> : null}
            {posting.requiresAdvancedDegree ? <Tag type="gray">Advanced degree</Tag> : null}
          </div>
        </div>
        <p className="posting-role">{posting.role}</p>
        <div className="posting-meta">
          <span>{posting.locations.join(" | ") || "Location unavailable"}</span>
          <span>{posting.category}</span>
          <span>{posting.ageText ?? "Age unavailable"}</span>
        </div>
      </div>

      <div className="posting-actions">
        <Button
          className="posting-track-button"
          kind="secondary"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            void onTrack(posting);
          }}
        >
          {posting.isTracked ? "Untrack" : "Track"}
        </Button>
        {posting.primaryApplicationUrl ? (
          <Button
            kind="primary"
            size="sm"
            renderIcon={Launch}
            href={posting.primaryApplicationUrl}
            target="_blank"
            onClick={(event) => event.stopPropagation()}
          >
            Apply
          </Button>
        ) : null}
      </div>
    </article>
  );
});

export function VirtualizedPostingList({
  isLoading,
  onFollow,
  onSelect,
  onTrack,
  postings,
  selectedPostingId
}: {
  isLoading: boolean;
  onFollow: (posting: JobPostingDto) => Promise<void>;
  onSelect: (posting: JobPostingDto) => void;
  onTrack: (posting: JobPostingDto) => Promise<void>;
  postings: JobPostingDto[];
  selectedPostingId: string | null;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [shouldVirtualize, setShouldVirtualize] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(postingListDesktopQuery).matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(postingListDesktopQuery);
    const updateVirtualizationMode = () => setShouldVirtualize(mediaQuery.matches);

    updateVirtualizationMode();
    mediaQuery.addEventListener("change", updateVirtualizationMode);

    return () => mediaQuery.removeEventListener("change", updateVirtualizationMode);
  }, []);

  useEffect(() => {
    if (!shouldVirtualize || !listRef.current) {
      return undefined;
    }

    const element = listRef.current;
    const resizeObserver = new ResizeObserver(() => {
      setViewportHeight(element.clientHeight);
      setScrollTop(element.scrollTop);
    });
    resizeObserver.observe(element);
    setViewportHeight(element.clientHeight);
    setScrollTop(element.scrollTop);

    return () => resizeObserver.disconnect();
  }, [shouldVirtualize]);

  const virtualRows = useMemo(() => {
    if (!shouldVirtualize) {
      return {
        rows: postings.map((posting, index) => ({
          index,
          posting,
          start: 0
        })),
        totalSize: 0
      };
    }

    const visibleStart = Math.max(0, scrollTop - postingRowSize * postingRowOverscan);
    const visibleEnd = scrollTop + Math.max(viewportHeight, postingRowSize * 4) + postingRowSize * postingRowOverscan;
    const startIndex = Math.max(0, Math.floor(visibleStart / postingRowSize));
    const endIndex = Math.min(postings.length - 1, Math.ceil(visibleEnd / postingRowSize));
    const rows: Array<{ index: number; posting: JobPostingDto; start: number }> = [];

    for (let index = startIndex; index <= endIndex; index += 1) {
      const posting = postings[index];
      if (posting) {
        rows.push({ index, posting, start: index * postingRowSize });
      }
    }

    return {
      rows,
      totalSize: Math.max(0, postings.length * postingRowSize - postingRowGap)
    };
  }, [postings, scrollTop, shouldVirtualize, viewportHeight]);

  return (
    <div
      className={`posting-list${shouldVirtualize ? " posting-list--virtualized" : ""}`}
      aria-label="Internship postings"
      ref={listRef}
      onScroll={shouldVirtualize ? (event) => setScrollTop(event.currentTarget.scrollTop) : undefined}
    >
      {!isLoading && postings.length === 0 ? (
        <div className="posting-empty">
          <p>No postings match the current filters.</p>
          <span>Adjust filters.</span>
        </div>
      ) : null}

      {shouldVirtualize ? (
        <div className="posting-list__space" style={{ blockSize: `${virtualRows.totalSize}px` }}>
          {virtualRows.rows.map(({ posting, start }) => (
            <div
              className="posting-list__row"
              key={posting.id}
              style={{ transform: `translateY(${start}px)` }}
            >
              <PostingCard
                isSelected={posting.id === selectedPostingId}
                posting={posting}
                onFollow={onFollow}
                onSelect={onSelect}
                onTrack={onTrack}
              />
            </div>
          ))}
        </div>
      ) : (
        postings.map((posting) => (
          <PostingCard
            key={posting.id}
            isSelected={posting.id === selectedPostingId}
            posting={posting}
            onFollow={onFollow}
            onSelect={onSelect}
            onTrack={onTrack}
          />
        ))
      )}
    </div>
  );
}
