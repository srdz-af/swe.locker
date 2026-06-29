import { memo, type CSSProperties, type KeyboardEvent, useEffect, useMemo, useState } from "react";
import {
  Button,
  DatePicker,
  DatePickerInput,
  Loading,
  OverflowMenu,
  OverflowMenuItem,
  Select,
  SelectItem,
  Tag,
  TextArea,
  TextInput,
  Tile,
  TimePicker
} from "@carbon/react";
import { Add, Launch, Save, TrashCan } from "@carbon/icons-react";
import type {
  ApplicationDto,
  ApplicationInterviewDateDto,
  ApplicationLinkDto,
  ApplicationStatus,
  UpdateApplicationDetailsRequest
} from "../../../../shared/src/index";
import { applicationStatuses, getApplicationStatusColor } from "../../constants";
import { formatDate } from "../../utils/format";

type InterviewDateInput = {
  id: string;
  label: string;
  date: string;
  time: string;
};

type ApplicationLinkInput = {
  id: string;
  label: string;
  url: string;
};

type SystemApplicationLink = {
  id: string;
  label: string;
  url: string;
};

function ApplicationCard({
  application,
  isSelected,
  onArchive,
  onDelete,
  onSelect,
  onStatusChange
}: {
  application: ApplicationDto;
  isSelected: boolean;
  onArchive: (application: ApplicationDto) => Promise<void>;
  onDelete: (application: ApplicationDto) => Promise<void>;
  onSelect: (application: ApplicationDto) => void;
  onStatusChange: (application: ApplicationDto, status: ApplicationStatus) => Promise<void>;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    if (event.target instanceof HTMLElement && event.target.closest("a, button, select")) {
      return;
    }

    event.preventDefault();
    onSelect(application);
  }

  return (
    <article
      aria-label={`${application.company}, ${application.role}`}
      aria-selected={isSelected}
      className={`application-card${isSelected ? " application-card--selected" : ""}`}
      onClick={() => onSelect(application)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="application-card__header">
        <div>
          <h3>{application.company}</h3>
          <p>{application.role}</p>
        </div>
        <OverflowMenu
          aria-label={`Actions for ${application.company} ${application.role}`}
          className="application-card__menu"
          flipped
          iconDescription="Application actions"
          size="sm"
        >
          <OverflowMenuItem
            itemText="Archive"
            onClick={(event) => {
              event.stopPropagation();
              void onArchive(application);
            }}
          />
          <OverflowMenuItem
            hasDivider
            isDelete
            itemText="Delete"
            onClick={(event) => {
              event.stopPropagation();
              void onDelete(application);
            }}
          />
        </OverflowMenu>
      </div>

      <div className="application-card__meta">
        <span>Updated {formatDate(application.updatedAt)}</span>
      </div>

      <div
        className="application-status-control"
        style={{ "--application-status-color": getApplicationStatusColor(application.status) } as CSSProperties}
      >
        <span className="application-status-indicator" aria-hidden="true" />
        <Select
          hideLabel
          id={`application-status-${application.id}`}
          labelText={`Status for ${application.company} ${application.role}`}
          size="sm"
          value={application.status}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => void onStatusChange(application, event.target.value as ApplicationStatus)}
        >
          {applicationStatuses.map((option) => (
            <SelectItem key={option.status} text={option.label} value={option.status} />
          ))}
        </Select>
      </div>
    </article>
  );
}

function ApplicationDetailsPanel({
  application,
  isSaving,
  onSave
}: {
  application: ApplicationDto | null;
  isSaving: boolean;
  onSave: (application: ApplicationDto, details: UpdateApplicationDetailsRequest) => Promise<void>;
}) {
  const [notes, setNotes] = useState("");
  const [interviewDates, setInterviewDates] = useState<InterviewDateInput[]>([]);
  const [links, setLinks] = useState<ApplicationLinkInput[]>([]);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  useEffect(() => {
    setDetailsError(null);
    setNotes(application?.notes ?? "");
    setInterviewDates(application?.interviewDates.map(createInterviewDateInputFromDto) ?? []);
    setLinks(application?.links.map(createApplicationLinkInputFromDto) ?? []);
  }, [application]);

  if (!application) {
    return (
      <Tile className="application-details-tile">
        <div className="application-details-empty">
          <p>No application selected.</p>
          <span>Select an application to inspect notes, interviews, links, and metadata.</span>
        </div>
      </Tile>
    );
  }

  async function handleSave() {
    if (!application) {
      return;
    }

    try {
      setDetailsError(null);
      await onSave(application, {
        notes,
        interviewDates: serializeInterviewDates(interviewDates),
        links: serializeApplicationLinks(links)
      });
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : "Could not save application details.");
    }
  }

  const canEditInterviewDates = application.status === "INTERVIEW";
  const systemLinks = getSystemApplicationLinks(application);

  return (
    <Tile className="application-details-tile">
      <div className="section-header">
        <div>
          <h2>{application.company}</h2>
          <p>{application.role}</p>
          <span className="application-details-updated">Updated {formatDate(application.updatedAt)}</span>
        </div>
        <Button kind="primary" size="sm" renderIcon={Save} disabled={isSaving} onClick={() => void handleSave()}>
          Save
        </Button>
      </div>

      <div className="application-details-form">
        <TextArea
          id={`application-notes-${application.id}`}
          labelText="Notes"
          placeholder="Notes about recruiter calls, prep, decisions, or follow-up."
          rows={6}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
        <div
          className={`application-interview-editor${
            canEditInterviewDates ? "" : " application-interview-editor--disabled"
          }`}
        >
          <div className="application-interview-editor__header">
            <h3>Interview dates</h3>
            <Button
              disabled={!canEditInterviewDates}
              kind="tertiary"
              renderIcon={Add}
              size="sm"
              onClick={() => setInterviewDates((currentDates) => [...currentDates, createNewInterviewDateInput()])}
            >
              Add
            </Button>
          </div>
          {interviewDates.length > 0 ? (
            <div className="application-interview-list">
              {interviewDates.map((interviewDate, interviewDateIndex) => (
                <div className="application-interview-row" key={interviewDate.id}>
                  <TextInput
                    disabled={!canEditInterviewDates}
                    hideLabel
                    id={`application-interview-label-${application.id}-${interviewDate.id}`}
                    labelText={`Interview ${interviewDateIndex + 1} label`}
                    placeholder={`Interview ${interviewDateIndex + 1}`}
                    size="sm"
                    value={interviewDate.label}
                    onChange={(event) =>
                      setInterviewDates((currentDates) =>
                        currentDates.map((currentDate) =>
                          currentDate.id === interviewDate.id ? { ...currentDate, label: event.target.value } : currentDate
                        )
                      )
                    }
                  />
                  <DatePicker
                    dateFormat="M j"
                    datePickerType="single"
                    value={parseDatePickerValue(interviewDate.date)}
                    onChange={(selectedDates: Date[]) => {
                      if (!canEditInterviewDates) {
                        return;
                      }

                      const selectedDate = selectedDates[0];
                      if (!selectedDate) {
                        return;
                      }

                      setInterviewDates((currentDates) =>
                        currentDates.map((currentDate) =>
                          currentDate.id === interviewDate.id
                            ? { ...currentDate, date: formatDateInputValue(selectedDate) }
                            : currentDate
                        )
                      );
                    }}
                  >
                    <DatePickerInput
                      id={`application-interview-date-${application.id}-${interviewDate.id}`}
                      disabled={!canEditInterviewDates}
                      hideLabel
                      labelText={`Interview ${interviewDateIndex + 1} date`}
                      placeholder="Jun 26"
                      size="sm"
                    />
                  </DatePicker>
                  <TimePicker
                    id={`application-interview-time-${application.id}-${interviewDate.id}`}
                    labelText={`Interview ${interviewDateIndex + 1} time`}
                    size="sm"
                    type="time"
                    value={interviewDate.time}
                    disabled={!canEditInterviewDates}
                    hideLabel
                    onChange={(event) =>
                      setInterviewDates((currentDates) =>
                        currentDates.map((currentDate) =>
                          currentDate.id === interviewDate.id ? { ...currentDate, time: event.target.value } : currentDate
                        )
                      )
                    }
                  />
                  <Button
                    disabled={!canEditInterviewDates}
                    hasIconOnly
                    iconDescription={`Remove interview ${interviewDateIndex + 1}`}
                    kind="ghost"
                    renderIcon={TrashCan}
                    size="sm"
                    tooltipPosition="left"
                    onClick={() =>
                      setInterviewDates((currentDates) => currentDates.filter((currentDate) => currentDate.id !== interviewDate.id))
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="application-interview-empty">No interview dates.</p>
          )}
        </div>
        <div className="application-link-editor">
          <div className="application-link-editor__header">
            <h3>Links</h3>
            <Button
              kind="tertiary"
              renderIcon={Add}
              size="sm"
              onClick={() => setLinks((currentLinks) => [...currentLinks, createNewApplicationLinkInput()])}
            >
              Add
            </Button>
          </div>

          {systemLinks.length > 0 || links.length > 0 ? (
            <div className="application-link-list">
              {systemLinks.map((link) => (
                <div className="application-link-row application-link-row--system" key={link.id}>
                  <span className="application-link-row__label">{link.label}</span>
                  <a className="application-link-row__url" href={link.url} target="_blank" rel="noreferrer">
                    {link.url}
                  </a>
                  <a
                    aria-label={`Open ${link.label}`}
                    className="application-link-row__launch"
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Launch size={16} />
                  </a>
                </div>
              ))}

              {links.map((link, linkIndex) => {
                const clickableUrl = getClickableUrl(link.url);

                return (
                  <div className="application-link-row" key={link.id}>
                    <TextInput
                      hideLabel
                      id={`application-link-label-${application.id}-${link.id}`}
                      labelText={`Link ${linkIndex + 1} label`}
                      placeholder="Label"
                      size="sm"
                      value={link.label}
                      onChange={(event) =>
                        setLinks((currentLinks) =>
                          currentLinks.map((currentLink) =>
                            currentLink.id === link.id ? { ...currentLink, label: event.target.value } : currentLink
                          )
                        )
                      }
                    />
                    <TextInput
                      hideLabel
                      id={`application-link-url-${application.id}-${link.id}`}
                      labelText={`Link ${linkIndex + 1} URL`}
                      placeholder="https://example.com"
                      size="sm"
                      value={link.url}
                      onChange={(event) =>
                        setLinks((currentLinks) =>
                          currentLinks.map((currentLink) =>
                            currentLink.id === link.id ? { ...currentLink, url: event.target.value } : currentLink
                          )
                        )
                      }
                    />
                    {clickableUrl ? (
                      <a
                        aria-label={`Open link ${linkIndex + 1}`}
                        className="application-link-row__launch"
                        href={clickableUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Launch size={16} />
                      </a>
                    ) : (
                      <span aria-hidden="true" className="application-link-row__launch application-link-row__launch--disabled">
                        <Launch size={16} />
                      </span>
                    )}
                    <Button
                      hasIconOnly
                      iconDescription={`Remove link ${linkIndex + 1}`}
                      kind="ghost"
                      renderIcon={TrashCan}
                      size="sm"
                      tooltipPosition="left"
                      onClick={() => setLinks((currentLinks) => currentLinks.filter((currentLink) => currentLink.id !== link.id))}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="application-link-empty">No links.</p>
          )}
        </div>
        {detailsError ? <p className="application-details-error">{detailsError}</p> : null}
      </div>

    </Tile>
  );
}

export const ApplicationTrackerPanel = memo(function ApplicationTrackerPanel({
  applications = [],
  isLoading,
  isSavingDetails,
  onArchive,
  onCreate,
  onDelete,
  onDetailsSave,
  onSelect,
  onStatusChange,
  selectedApplicationId
}: {
  applications?: ApplicationDto[];
  isLoading: boolean;
  isSavingDetails: boolean;
  onArchive: (application: ApplicationDto) => Promise<void>;
  onCreate: () => void;
  onDelete: (application: ApplicationDto) => Promise<void>;
  onDetailsSave: (application: ApplicationDto, details: UpdateApplicationDetailsRequest) => Promise<void>;
  onSelect: (application: ApplicationDto) => void;
  onStatusChange: (application: ApplicationDto, status: ApplicationStatus) => Promise<void>;
  selectedApplicationId: string | null;
}) {
  const applicationsByStatus = useMemo(() => {
    const groupedApplications = new Map<ApplicationStatus, ApplicationDto[]>();
    for (const option of applicationStatuses) {
      groupedApplications.set(option.status, []);
    }

    for (const application of applications) {
      groupedApplications.get(application.status)?.push(application);
    }

    return groupedApplications;
  }, [applications]);
  const selectedApplication = useMemo(
    () => applications.find((application) => application.id === selectedApplicationId) ?? null,
    [applications, selectedApplicationId]
  );

  return (
    <div className="tracker-layout">
      <Tile className="tracker-tile">
        <div className="section-header">
          <div>
            <h2>Application tracker</h2>
            <p>{applications.length} tracked applications</p>
          </div>
          <Button kind="primary" renderIcon={Add} size="sm" onClick={onCreate}>
            Add application
          </Button>
        </div>

        {isLoading ? <Loading description="Loading applications" withOverlay={false} /> : null}

        <div className="kanban-board" aria-label="Application tracker board">
          {applicationStatuses.map((option) => {
            const columnApplications = applicationsByStatus.get(option.status) ?? [];

            return (
              <section className="kanban-column" key={option.status} aria-label={option.label}>
                <div className="kanban-column__header">
                  <h3>{option.label}</h3>
                  <Tag type="gray">{columnApplications.length}</Tag>
                </div>

                <div className="application-card-list">
                  {columnApplications.map((application) => (
                    <ApplicationCard
                      application={application}
                      isSelected={application.id === selectedApplicationId}
                      key={application.id}
                      onArchive={onArchive}
                      onDelete={onDelete}
                      onSelect={onSelect}
                      onStatusChange={onStatusChange}
                    />
                  ))}

                  {!isLoading && columnApplications.length === 0 ? <p className="kanban-empty">No applications</p> : null}
                </div>
              </section>
            );
          })}
        </div>
      </Tile>
      <ApplicationDetailsPanel application={selectedApplication} isSaving={isSavingDetails} onSave={onDetailsSave} />
    </div>
  );
});

function createInterviewDateInputFromDto(value: ApplicationInterviewDateDto, index = 0): InterviewDateInput {
  const date = new Date(value.date);
  if (!Number.isFinite(date.getTime())) {
    return {
      id: `interview-${index}-${Date.now()}`,
      label: value.label ?? `Interview ${index + 1}`,
      date: "",
      time: ""
    };
  }

  return {
    id: `interview-${index}-${date.getTime()}`,
    label: value.label ?? `Interview ${index + 1}`,
    date: formatDateInputValue(date),
    time: formatTimeInputValue(date)
  };
}

function createNewInterviewDateInput(): InterviewDateInput {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);

  return {
    id: `interview-new-${Date.now()}`,
    label: "Interview",
    date: formatDateInputValue(date),
    time: formatTimeInputValue(date)
  };
}

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDatePickerValue(value: string) {
  if (!value) {
    return undefined;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function formatTimeInputValue(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${hours}:${minutes}`;
}

function serializeInterviewDates(values: InterviewDateInput[]) {
  return values
    .filter((value) => value.date || value.time)
    .map((value, index) => {
      if (!value.date || !value.time) {
        throw new Error(`Interview ${index + 1} needs both date and time.`);
      }

      const date = new Date(`${value.date}T${value.time}`);

      if (!Number.isFinite(date.getTime())) {
        throw new Error(`Invalid interview ${index + 1}.`);
      }

      return {
        label: value.label.trim() || `Interview ${index + 1}`,
        date: date.toISOString()
      };
    });
}

function createApplicationLinkInputFromDto(link: ApplicationLinkDto, index = 0): ApplicationLinkInput {
  return {
    id: createClientId(`link-${index}`),
    label: link.label ?? "",
    url: link.url
  };
}

function createNewApplicationLinkInput(): ApplicationLinkInput {
  return {
    id: createClientId("link-new"),
    label: "",
    url: ""
  };
}

function serializeApplicationLinks(values: ApplicationLinkInput[]) {
  return values
    .filter((value) => value.label.trim() || value.url.trim())
    .map((value, index) => {
      if (!value.url.trim()) {
        throw new Error(`Link ${index + 1} needs a URL.`);
      }

      return {
        label: value.label.trim() || null,
        url: normalizeUrl(value.url.trim())
      };
    });
}

function getSystemApplicationLinks(application: ApplicationDto): SystemApplicationLink[] {
  const links: SystemApplicationLink[] = [];

  if (application.jobPostingUrl) {
    links.push({
      id: "posting",
      label: "Posting",
      url: application.jobPostingUrl
    });
  }

  if (application.externalApplicationTrackingUrl) {
    links.push({
      id: "tracking",
      label: "External tracking",
      url: application.externalApplicationTrackingUrl
    });
  }

  return links;
}

function getClickableUrl(value: string) {
  try {
    return value.trim() ? normalizeUrl(value.trim()) : null;
  } catch {
    return null;
  }
}

function createClientId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeUrl(value: string) {
  if (!value) {
    throw new Error("Application links need a URL.");
  }

  const url = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
  const parsedUrl = new URL(url);

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Application links must use http(s).");
  }

  return parsedUrl.toString();
}
