import {
  Button,
  Column,
  Content,
  Grid,
  Header,
  HeaderName,
  InlineNotification,
  SkipToContent,
  Tag,
  Tile
} from "@carbon/react";
import { Add, Renew } from "@carbon/icons-react";
import "./styles.scss";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

const stats = [
  { label: "Total postings", value: "0" },
  { label: "New today", value: "0" },
  { label: "Followed matches", value: "0" },
  { label: "Tracked applications", value: "0" }
];

const feedColumns = ["Company", "Role", "Location", "Category", "Age"];

function App() {
  return (
    <>
      <Header aria-label="swe.locker">
        <SkipToContent />
        <HeaderName href="/" prefix="swe">
          locker
        </HeaderName>
      </Header>

      <Content id="main-content" className="app-content">
        <Grid fullWidth className="dashboard-grid">
          <Column sm={4} md={8} lg={16}>
            <div className="dashboard-heading">
              <div>
                <Tag type="blue" size="md">
                  Summer 2026
                </Tag>
                <h1>Internship dashboard</h1>
                <p>
                  Track new SWE internship postings, followed companies, and applications from
                  SimplifyJobs.
                </p>
              </div>

              <div className="dashboard-actions">
                <Button kind="secondary" renderIcon={Renew}>
                  Refresh source
                </Button>
                <Button renderIcon={Add}>Track application</Button>
              </div>
            </div>
          </Column>

          <Column sm={4} md={8} lg={11}>
            <Tile className="feed-shell">
              <div className="section-header">
                <div>
                  <h2>Latest postings</h2>
                  <p>Scaffold placeholder for the first ingestion milestone.</p>
                </div>
                <Tag type="gray">API {apiBaseUrl}</Tag>
              </div>

              <div className="posting-table" role="table" aria-label="Internship postings">
                <div className="posting-row posting-row--header" role="row">
                  {feedColumns.map((column) => (
                    <span role="columnheader" key={column}>
                      {column}
                    </span>
                  ))}
                </div>
                <div className="posting-empty" role="row">
                  <p>No postings loaded yet.</p>
                  <span>Fetcher and parser work starts in the first milestone.</span>
                </div>
              </div>
            </Tile>
          </Column>

          <Column sm={4} md={8} lg={5}>
            <div className="sidebar-stack">
              <Tile className="notice-tile">
                <InlineNotification
                  kind="info"
                  lowContrast
                  title="Scaffold ready"
                  subtitle="The dashboard shell is connected to the planned API shape."
                  hideCloseButton
                />
              </Tile>

              <Tile className="stats-tile">
                <h2>Stats</h2>
                <div className="stats-grid">
                  {stats.map((item) => (
                    <div className="stat-item" key={item.label}>
                      <strong>{item.value}</strong>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </Tile>
            </div>
          </Column>
        </Grid>
      </Content>
    </>
  );
}

export default App;
