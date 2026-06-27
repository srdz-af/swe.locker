import { config } from "./config.js";
import { refreshSourceIfEmpty, refreshSource } from "./services/refreshService.js";

export function startRefreshScheduler() {
  void refreshSourceIfEmpty().catch((error) => {
    console.error("Initial source refresh failed.", error);
  });

  const interval = setInterval(
    () => {
      void refreshSource().catch((error) => {
        console.error("Scheduled source refresh failed.", error);
      });
    },
    config.fetchIntervalHours * 60 * 60 * 1000
  );

  interval.unref();
}
