import { memo, type CSSProperties, type KeyboardEvent, useEffect, useMemo, useState } from "react";
import {
  Button,
  DatePicker,
  DatePickerInput,
  Loading,
  Modal,
  Select,
  SelectItem,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  TextInput,
  Tile,
  TimePicker
} from "@carbon/react";
import { Add, Archive, Edit, Launch, Save, TrashCan } from "@carbon/icons-react";
import type {
  ApplicationDto,
  ApplicationInterviewDateDto,
  ApplicationLinkDto,
  ApplicationStatus,
  ResumeRunDto,
  UpdateApplicationDetailsRequest
} from "../../../../shared/src/index";
import { TextModePanel, type TextMode } from "../../components/TextModePanel";
import {
  activeApplicationStatuses,
  applicationStatuses,
  getApplicationStatusColor,
  modalPrimaryFocusSelector
} from "../../constants";
import { formatDate } from "../../utils/format";

type InterviewDateInput = {
  id: string;
  label: string;
  date: string;
  time: string;
  mode: "display" | "draft";
};

type ApplicationLinkInput = {
  id: string;
  label: string;
  url: string;
  mode: "display" | "draft";
};

type SystemApplicationLink = {
  id: string;
  label: string;
  url: string;
};

const maxApplicationInterviewRound = 20;

function getApplicationStatusOptions(application: ApplicationDto) {
  return applicationStatuses.filter(
    (option) =>
      (option.status !== "DECLINED" && option.status !== "HIRED") ||
      application.status === "OFFER" ||
      application.status === option.status
  );
}

function ApplicationCard({
  application,
  isSelected,
  onSelect,
  onStatusChange
}: {
  application: ApplicationDto;
  isSelected: boolean;
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
          {getApplicationStatusOptions(application).map((option) => (
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
  onArchive,
  onDelete,
  onSave,
  onStatusChange,
  resumeRuns
}: {
  application: ApplicationDto;
  isSaving: boolean;
  onArchive: (application: ApplicationDto) => Promise<void>;
  onDelete: (application: ApplicationDto) => Promise<void>;
  onSave: (application: ApplicationDto, details: UpdateApplicationDetailsRequest) => Promise<void>;
  onStatusChange: (application: ApplicationDto, status: ApplicationStatus) => Promise<void>;
  resumeRuns: ResumeRunDto[];
}) {
  const [notes, setNotes] = useState("");
  const [notesMode, setNotesMode] = useState<TextMode>("preview");
  const [interviewDates, setInterviewDates] = useState<InterviewDateInput[]>([]);
  const [interviewRound, setInterviewRound] = useState("1");
  const [links, setLinks] = useState<ApplicationLinkInput[]>([]);
  const [submittedResumeRunId, setSubmittedResumeRunId] = useState("");
  const [detailsError, setDetailsError] = useState<string | null>(null);

  useEffect(() => {
    setDetailsError(null);
    setNotesMode("preview");
    setNotes(application?.notes ?? "");
    setInterviewDates(application?.interviewDates.map(createInterviewDateInputFromDto) ?? []);
    setInterviewRound(String(application.interviewRound ?? 1));
    setLinks(application?.links.map(createApplicationLinkInputFromDto) ?? []);
    setSubmittedResumeRunId(application.submittedResumeRunId ?? "");
  }, [application.id]);

  async function handleSave() {
    try {
      setDetailsError(null);
      await onSave(application, {
        notes,
        interviewDates: serializeInterviewDates(interviewDates),
        interviewRound: application.status === "INTERVIEW" ? serializeInterviewRound(interviewRound) : application.interviewRound,
        links: serializeApplicationLinks(links),
        submittedResumeRunId: submittedResumeRunId || null
      });
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : "Could not save application details.");
    }
  }

  async function handleArchive() {
    try {
      setDetailsError(null);
      await onArchive(application);
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : `Could not ${application.archivedAt ? "unarchive" : "archive"} application.`);
    }
  }

  async function handleDelete() {
    try {
      setDetailsError(null);
      await onDelete(application);
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : "Could not delete application.");
    }
  }

  function handleCommitInterviewDate(interviewDate: InterviewDateInput, interviewDateIndex: number) {
    try {
      validateInterviewDateInput(interviewDate, interviewDateIndex);
      setDetailsError(null);
      setInterviewDates((currentDates) =>
        currentDates.map((currentDate) =>
          currentDate.id === interviewDate.id ? { ...currentDate, mode: "display" } : currentDate
        )
      );
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : `Invalid interview ${interviewDateIndex + 1}.`);
    }
  }

  function handleCommitLink(link: ApplicationLinkInput, linkIndex: number) {
    try {
      if (!link.url.trim()) {
        throw new Error(`Link ${linkIndex + 1} needs a URL.`);
      }

      normalizeUrl(link.url.trim());
      setDetailsError(null);
      setLinks((currentLinks) =>
        currentLinks.map((currentLink) => (currentLink.id === link.id ? { ...currentLink, mode: "display" } : currentLink))
      );
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : `Invalid link ${linkIndex + 1}.`);
    }
  }

  const canEditInterviewDates = application.status === "INTERVIEW";
  const systemLinks = getSystemApplicationLinks(application);
  const submittedResumeRun = resumeRuns.find((run) => run.id === submittedResumeRunId) ?? null;
  const hasMissingSubmittedResumeRun = Boolean(submittedResumeRunId && !submittedResumeRun);

  return (
    <div className="application-details-panel" data-app-modal-primary-focus tabIndex={-1}>
      <div className="section-header">
        <div>
          <h2>{application.company}</h2>
          <p>{application.role}</p>
          <span className="application-details-updated">Updated {formatDate(application.updatedAt)}</span>
        </div>
        <div className="application-details-actions">
          <div
            className="application-status-control application-status-control--details"
            style={{ "--application-status-color": getApplicationStatusColor(application.status) } as CSSProperties}
          >
            <span className="application-status-indicator" aria-hidden="true" />
            <Select
              hideLabel
              id={`application-details-status-${application.id}`}
              labelText={`Status for ${application.company} ${application.role}`}
              size="sm"
              value={application.status}
              onChange={(event) => void onStatusChange(application, event.target.value as ApplicationStatus)}
            >
              {getApplicationStatusOptions(application).map((option) => (
                <SelectItem key={option.status} text={option.label} value={option.status} />
              ))}
            </Select>
          </div>
          <Button kind="primary" size="sm" renderIcon={Save} disabled={isSaving} onClick={() => void handleSave()}>
            Save
          </Button>
          <Button
            className="application-details-icon-action"
            hasIconOnly
            iconDescription={application.archivedAt ? "Unarchive application" : "Archive application"}
            kind="ghost"
            renderIcon={Archive}
            size="sm"
            tooltipPosition="left"
            onClick={() => void handleArchive()}
          />
          <Button
            className="application-details-icon-action"
            hasIconOnly
            iconDescription="Delete application"
            kind="danger--ghost"
            renderIcon={TrashCan}
            size="sm"
            tooltipPosition="left"
            onClick={() => void handleDelete()}
          />
        </div>
      </div>

      <div className="application-details-form">
        <div className="application-notes-panel">
          <TextModePanel
            className="application-notes-editor"
            headerClassName="application-notes-toolbar"
            id={`application-notes-${application.id}`}
            mode={notesMode}
            onModeChange={setNotesMode}
            onRawTextChange={setNotes}
            previewAriaLabel="Notes preview"
            previewBodyClassName="application-notes-preview"
            previewEmpty={<p className="application-notes-preview-empty">No notes yet.</p>}
            previewLabel="Preview"
            previewMarkdown={notes}
            rawLabel="Edit"
            rawText={notes}
            rawTextAreaId={`application-notes-${application.id}`}
            rawTextAreaLabel="Notes"
            rawTextAreaPlaceholder="Notes about recruiter calls, prep, decisions, or follow-up. Supports markdown"
            rawTextAreaRows={24}
            scrollKey={application.id}
            tabsAriaLabel="Application notes views"
            tabsClassName="application-notes-view-tabs"
            title="Notes"
            toggleLabel="Edit"
          />
        </div>
        <div className="application-details-side-panel">
          <div className="application-resume-editor">
            <h3>Submitted resume</h3>
            <Select
              id={`application-resume-run-${application.id}`}
              labelText="Associated resume"
              size="sm"
              value={submittedResumeRunId}
              onChange={(event) => setSubmittedResumeRunId(event.target.value)}
            >
              <SelectItem text="No associated resume" value="" />
              {hasMissingSubmittedResumeRun ? <SelectItem text="Missing resume run" value={submittedResumeRunId} /> : null}
              {resumeRuns.map((run) => (
                <SelectItem key={run.id} text={formatResumeRunOption(run)} value={run.id} />
              ))}
            </Select>
            {submittedResumeRun ? (
              <div className="application-resume-summary">
                <span>{formatDate(submittedResumeRun.createdAt)}</span>
                <strong>{formatResumeRunScore(submittedResumeRun)}</strong>
              </div>
            ) : null}
          </div>
          <div
            className={`application-interview-editor${
              canEditInterviewDates ? "" : " application-interview-editor--disabled"
            }`}
          >
            <div className="application-interview-editor__header">
              <h3>Interview dates</h3>
              <Button
                className="application-editor-add-button"
                disabled={!canEditInterviewDates}
                hasIconOnly
                iconDescription="Add interview date"
                kind="ghost"
                renderIcon={Add}
                size="sm"
                tooltipPosition="left"
                onClick={() => setInterviewDates((currentDates) => [...currentDates, createNewInterviewDateInput()])}
              />
            </div>
            {interviewDates.length > 0 ? (
              <div className="application-interview-list">
                {interviewDates.map((interviewDate, interviewDateIndex) => {
                  const displayDate = getInterviewDateDisplayParts(interviewDate, interviewDateIndex);

                  return (
                    <div
                      className={`application-interview-row${
                        interviewDate.mode === "draft" ? " application-interview-row--draft" : ""
                      }`}
                      key={interviewDate.id}
                    >
                      {interviewDate.mode === "display" ? (
                        <>
                          <span className="application-interview-row__label">{displayDate.label}</span>
                          <span className="application-interview-row__value">{displayDate.date}</span>
                          <span className="application-interview-row__value">{displayDate.time}</span>
                          <Button
                            disabled={!canEditInterviewDates}
                            hasIconOnly
                            iconDescription={`Edit interview ${interviewDateIndex + 1}`}
                            kind="ghost"
                            renderIcon={Edit}
                            size="sm"
                            tooltipPosition="left"
                            onClick={() =>
                              setInterviewDates((currentDates) =>
                                currentDates.map((currentDate) =>
                                  currentDate.id === interviewDate.id ? { ...currentDate, mode: "draft" } : currentDate
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
                              setInterviewDates((currentDates) =>
                                currentDates.filter((currentDate) => currentDate.id !== interviewDate.id)
                              )
                            }
                          />
                        </>
                      ) : (
                        <>
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
                            iconDescription={`Save interview ${interviewDateIndex + 1}`}
                            kind="ghost"
                            renderIcon={Save}
                            size="sm"
                            tooltipPosition="left"
                            onClick={() => handleCommitInterviewDate(interviewDate, interviewDateIndex)}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="application-interview-empty">No interview dates.</p>
            )}
            <TextInput
              disabled={!canEditInterviewDates}
              id={`application-interview-round-${application.id}`}
              labelText="Current round"
              max={maxApplicationInterviewRound}
              min={1}
              size="sm"
              type="number"
              value={interviewRound}
              onChange={(event) => setInterviewRound(event.target.value)}
            />
          </div>
          <div className="application-link-editor">
            <div className="application-link-editor__header">
              <h3>Links</h3>
              <Button
                className="application-editor-add-button"
                hasIconOnly
                iconDescription="Add link"
                kind="ghost"
                renderIcon={Add}
                size="sm"
                tooltipPosition="left"
                onClick={() => setLinks((currentLinks) => [...currentLinks, createNewApplicationLinkInput()])}
              />
            </div>

            {systemLinks.length > 0 || links.length > 0 ? (
              <div className="application-link-list">
                {systemLinks.map((link) => (
                  <div className="application-link-row application-link-row--system" key={link.id}>
                    <a className="application-link-row__label application-link-row__label--link" href={link.url} target="_blank" rel="noreferrer">
                      {link.label}
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
                  const linkLabel = link.label.trim() || `Link ${linkIndex + 1}`;

                  return (
                    <div
                      className={`application-link-row${link.mode === "draft" ? " application-link-row--draft" : ""}`}
                      key={link.id}
                    >
                      {link.mode === "display" ? (
                        <>
                          {clickableUrl ? (
                            <a
                              className="application-link-row__label application-link-row__label--link"
                              href={clickableUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {linkLabel}
                            </a>
                          ) : (
                            <span className="application-link-row__label">{linkLabel}</span>
                          )}
                          <Button
                            hasIconOnly
                            iconDescription={`Edit ${linkLabel}`}
                            kind="ghost"
                            renderIcon={Edit}
                            size="sm"
                            tooltipPosition="left"
                            onClick={() =>
                              setLinks((currentLinks) =>
                                currentLinks.map((currentLink) =>
                                  currentLink.id === link.id ? { ...currentLink, mode: "draft" } : currentLink
                                )
                              )
                            }
                          />
                          <Button
                            hasIconOnly
                            iconDescription={`Remove ${linkLabel}`}
                            kind="ghost"
                            renderIcon={TrashCan}
                            size="sm"
                            tooltipPosition="left"
                            onClick={() => setLinks((currentLinks) => currentLinks.filter((currentLink) => currentLink.id !== link.id))}
                          />
                        </>
                      ) : (
                        <>
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
                          <Button
                            hasIconOnly
                            iconDescription={`Save link ${linkIndex + 1}`}
                            kind="ghost"
                            renderIcon={Save}
                            size="sm"
                            tooltipPosition="left"
                            onClick={() => handleCommitLink(link, linkIndex)}
                          />
                        </>
                      )}
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
      </div>

    </div>
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
  onPurgeArchived,
  onSelect,
  onStatusChange,
  resumeRuns = [],
  selectedApplicationId
}: {
  applications?: ApplicationDto[];
  isLoading: boolean;
  isSavingDetails: boolean;
  onArchive: (application: ApplicationDto) => Promise<void>;
  onCreate: () => void;
  onDelete: (application: ApplicationDto) => Promise<void>;
  onDetailsSave: (application: ApplicationDto, details: UpdateApplicationDetailsRequest) => Promise<void>;
  onPurgeArchived: (applications: ApplicationDto[]) => Promise<void>;
  onSelect: (application: ApplicationDto) => void;
  onStatusChange: (application: ApplicationDto, status: ApplicationStatus) => Promise<void>;
  resumeRuns?: ResumeRunDto[];
  selectedApplicationId: string | null;
}) {
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isPurgeConfirmOpen, setIsPurgeConfirmOpen] = useState(false);
  const [isPurgingArchived, setIsPurgingArchived] = useState(false);
  const activeApplications = useMemo(
    () => applications.filter((application) => !application.archivedAt),
    [applications]
  );
  const archivedApplications = useMemo(
    () => applications.filter((application) => application.archivedAt),
    [applications]
  );
  const applicationsByStatus = useMemo(() => {
    const groupedApplications = new Map<ApplicationStatus, ApplicationDto[]>();
    for (const option of activeApplicationStatuses) {
      groupedApplications.set(option.status, []);
    }

    for (const application of activeApplications) {
      groupedApplications.get(application.status)?.push(application);
    }

    return groupedApplications;
  }, [activeApplications]);
  const selectedApplication = useMemo(
    () => applications.find((application) => application.id === selectedApplicationId) ?? null,
    [applications, selectedApplicationId]
  );

  useEffect(() => {
    if (!selectedApplication) {
      setIsDetailsModalOpen(false);
    }
  }, [selectedApplication]);

  function handleSelectApplication(application: ApplicationDto) {
    onSelect(application);
    setIsDetailsModalOpen(true);
  }

  async function handlePurgeArchived() {
    if (archivedApplications.length === 0 || isPurgingArchived) {
      return;
    }

    setIsPurgingArchived(true);
    try {
      await onPurgeArchived(archivedApplications);
      setIsPurgeConfirmOpen(false);
    } finally {
      setIsPurgingArchived(false);
    }
  }

  return (
    <div className="tracker-layout">
      <Tile className="tracker-tile">
        <div className="section-header">
          <div>
            <h2>Application tracker</h2>
            <p>
              {activeApplications.length} active, {archivedApplications.length} archived
            </p>
          </div>
          <Button kind="primary" renderIcon={Add} size="sm" onClick={onCreate}>
            Add application
          </Button>
        </div>

        {isLoading ? <Loading description="Loading applications" withOverlay={false} /> : null}

        <div className="tracker-tabs">
          <Tabs>
            <TabList aria-label="Application tracker views" size="sm">
              <Tab>Active</Tab>
              <Tab>Archived</Tab>
            </TabList>
            <TabPanels>
              <TabPanel>
                <div className="kanban-board" aria-label="Active application tracker board">
                  {activeApplicationStatuses.map((option) => {
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
                              onSelect={handleSelectApplication}
                              onStatusChange={onStatusChange}
                            />
                          ))}

                          {!isLoading && columnApplications.length === 0 ? <p className="kanban-empty">No applications</p> : null}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </TabPanel>
              <TabPanel>
                <div className="archived-application-toolbar">
                  <span>{archivedApplications.length} archived</span>
                  <Button
                    disabled={archivedApplications.length === 0 || isPurgingArchived}
                    kind="danger--ghost"
                    renderIcon={TrashCan}
                    size="sm"
                    onClick={() => setIsPurgeConfirmOpen(true)}
                  >
                    Purge all
                  </Button>
                </div>
                {archivedApplications.length > 0 ? (
                  <div className="archived-application-list" aria-label="Archived applications">
                    {archivedApplications.map((application) => (
                      <ApplicationCard
                        application={application}
                        isSelected={application.id === selectedApplicationId}
                        key={application.id}
                        onSelect={handleSelectApplication}
                        onStatusChange={onStatusChange}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="kanban-empty">No archived applications</p>
                )}
              </TabPanel>
            </TabPanels>
          </Tabs>
        </div>
      </Tile>
      <Modal
        className="application-details-modal"
        modalHeading="Application details"
        modalAriaLabel={selectedApplication ? `${selectedApplication.company} ${selectedApplication.role}` : "Application details"}
        open={Boolean(selectedApplication && isDetailsModalOpen)}
        passiveModal
        selectorPrimaryFocus={modalPrimaryFocusSelector}
        size="lg"
        onRequestClose={() => setIsDetailsModalOpen(false)}
      >
        {selectedApplication ? (
          <ApplicationDetailsPanel
            application={selectedApplication}
            isSaving={isSavingDetails}
            onArchive={onArchive}
            onDelete={onDelete}
            onSave={onDetailsSave}
            onStatusChange={onStatusChange}
            resumeRuns={resumeRuns}
          />
        ) : null}
      </Modal>
      <Modal
        danger
        modalHeading="Purge archived applications"
        primaryButtonDisabled={archivedApplications.length === 0 || isPurgingArchived}
        primaryButtonText={isPurgingArchived ? "Purging" : "Purge all"}
        secondaryButtonText="Cancel"
        open={isPurgeConfirmOpen}
        size="xs"
        onRequestClose={() => {
          if (!isPurgingArchived) {
            setIsPurgeConfirmOpen(false);
          }
        }}
        onRequestSubmit={() => void handlePurgeArchived()}
      >
        <p>
          This will permanently delete {archivedApplications.length} archived{" "}
          {archivedApplications.length === 1 ? "application" : "applications"}.
        </p>
      </Modal>
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
      time: "",
      mode: "display"
    };
  }

  return {
    id: `interview-${index}-${date.getTime()}`,
    label: value.label ?? `Interview ${index + 1}`,
    date: formatDateInputValue(date),
    time: formatTimeInputValue(date),
    mode: "display"
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
    time: formatTimeInputValue(date),
    mode: "draft"
  };
}

function getInterviewDateDisplayParts(value: InterviewDateInput, index: number) {
  const date = new Date(`${value.date}T${value.time}`);
  const label = value.label.trim() || `Interview ${index + 1}`;

  if (!Number.isFinite(date.getTime())) {
    return {
      label,
      date: value.date || "No date",
      time: value.time || "No time"
    };
  }

  return {
    label,
    date: date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "long"
    }),
    time: date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit"
    })
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
      const date = validateInterviewDateInput(value, index);

      return {
        label: value.label.trim() || `Interview ${index + 1}`,
        date: date.toISOString()
      };
    });
}

function validateInterviewDateInput(value: InterviewDateInput, index: number) {
  if (!value.date || !value.time) {
    throw new Error(`Interview ${index + 1} needs both date and time.`);
  }

  const date = new Date(`${value.date}T${value.time}`);

  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Invalid interview ${index + 1}.`);
  }

  return date;
}

function serializeInterviewRound(value: string) {
  const round = Number(value);

  if (!Number.isInteger(round) || round < 1 || round > maxApplicationInterviewRound) {
    throw new Error(`Interview round must be between 1 and ${maxApplicationInterviewRound}.`);
  }

  return round;
}

function createApplicationLinkInputFromDto(link: ApplicationLinkDto, index = 0): ApplicationLinkInput {
  return {
    id: createClientId(`link-${index}`),
    label: link.label ?? "",
    url: link.url,
    mode: "display"
  };
}

function createNewApplicationLinkInput(): ApplicationLinkInput {
  return {
    id: createClientId("link-new"),
    label: "",
    url: "",
    mode: "draft"
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

function formatResumeRunOption(run: ResumeRunDto) {
  return `${run.sourceName} - ${formatDate(run.createdAt)} - ${formatResumeRunScore(run)}`;
}

function formatResumeRunScore(run: ResumeRunDto) {
  const gradeLabel = run.grade === null ? "Raw text" : `${run.grade}/100`;
  return run.tier ? `${gradeLabel}, ${run.tier}` : gradeLabel;
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
