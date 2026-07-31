import { Hono } from "hono";
import { BaseLayout } from "./components/layouts/BaseLayout";
import { MainPage } from "./components/pages/MainPage";
import api from "./api/handlers";
import { runNotificationSweep } from "./api/cron";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.route("/api", api);

app.get("/", (c) => {
  return c.html(
    <BaseLayout>
      <MainPage />
    </BaseLayout>
  );
});

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runNotificationSweep(env, new Date()));
  },
} satisfies ExportedHandler<Env>;
