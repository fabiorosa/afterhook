import { createHmac } from "node:crypto";

import { expect, test } from "@playwright/test";

async function createReceivedEvent(api, suffix) {
  const endpointResponse = await api.post(
    "http://127.0.0.1:3101/v1/endpoints",
    {
      data: { name: `Inspection ${suffix}` },
    },
  );
  const endpoint = await endpointResponse.json();
  const timestamp = Math.floor(Date.now() / 1000);
  const rawBody = JSON.stringify({
    event: "invoice.paid",
    reference: suffix,
    token: `private-${suffix}`,
  });
  const signature = createHmac("sha256", endpoint.signingSecret)
    .update(`${String(timestamp)}.${rawBody}`)
    .digest("hex");
  const eventResponse = await api.post(
    `http://127.0.0.1:3101/v1/endpoints/${endpoint.slug}/events`,
    {
      data: rawBody,
      headers: {
        "content-type": "application/json",
        "idempotency-key": `inspection-${suffix}`,
        "x-afterhook-timestamp": String(timestamp),
        "x-afterhook-signature": `sha256=${signature}`,
      },
    },
  );

  expect(endpointResponse.ok()).toBe(true);
  expect(eventResponse.status()).toBe(202);
  return { endpoint, event: await eventResponse.json() };
}

test("creates an endpoint, saves its one-time secret, and creates a destination", async ({
  page,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/#setup");
  await page.getByLabel("Endpoint name").fill("Billing events");
  await page.getByRole("button", { name: "Create endpoint" }).click();
  await expect(
    page.getByRole("heading", { name: "Signing secret for Billing events" }),
  ).toBeVisible();
  await expect(page.locator("code")).toContainText("ahsec_");
  await page.getByRole("button", { name: "Copy secret" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  await page.getByRole("button", { name: "I saved it" }).click();
  await expect(
    page.getByRole("heading", { name: "Signing secret for Billing events" }),
  ).toBeHidden();
  await page.getByLabel("Destination name").fill("Billing receiver");
  await page.getByLabel("HTTP URL").fill("https://example.test/billing");
  await page.getByLabel(/Authorization/).fill("Bearer private-value");
  await page.getByRole("button", { name: "Create destination" }).click();
  await expect(
    page.getByText(
      "Destination created. Its authorization value is stored encrypted.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Authorization encrypted").first()).toBeVisible();
  await expect(page.getByText("Bearer private-value")).toHaveCount(0);
});

test("keeps the setup controls keyboard reachable on a mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#setup");

  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "AfterHook events home" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Events", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Setup" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Endpoint name")).toBeFocused();
});

test("inspects a received event without exposing credential values", async ({
  page,
  request: api,
}) => {
  const created = await createReceivedEvent(api, "desktop");

  await page.goto("/#events");
  const eventLink = page.locator(`a[href="#events/${created.event.eventId}"]`);
  await expect(eventLink).toContainText("Inspection desktop");
  await eventLink.click();

  await expect(
    page.getByRole("heading", { name: "Event record" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "What happened" }),
  ).toBeVisible();
  await expect(page.getByText("Webhook received")).toBeVisible();
  await expect(page.locator("pre")).toContainText('"token": "[REDACTED]"');
  await expect(
    page.getByText("No destination delivery has started."),
  ).toBeVisible();
  await expect(page.getByText("private-desktop")).toHaveCount(0);
});

test("keeps event rows operable at a mobile viewport", async ({
  page,
  request: api,
}) => {
  const created = await createReceivedEvent(api, "mobile");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#events");

  const eventLink = page.locator(`a[href="#events/${created.event.eventId}"]`);
  await eventLink.focus();
  await expect(eventLink).toBeFocused();
  const box = await eventLink.boundingBox();
  expect(box?.width).toBeGreaterThan(340);
  expect(box?.x).toBeGreaterThanOrEqual(0);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "What happened" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});

test("shows honest event loading and empty states", async ({ page }) => {
  await page.route("**/v1/events", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });

  await page.goto("/#events");
  await expect(
    page.getByRole("status", { name: "Loading events" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Your first accepted webhook will appear here.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open setup" })).toBeVisible();
});

test("offers a retry when event history fails", async ({ page }) => {
  await page.route("**/v1/events", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        message: "PostgreSQL is temporarily unavailable.",
      }),
    });
  });

  await page.goto("/#events");
  await expect(
    page.getByRole("heading", { name: "Event history is unavailable" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});
