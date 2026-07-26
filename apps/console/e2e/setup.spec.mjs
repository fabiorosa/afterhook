import { expect, test } from "@playwright/test";

test("creates an endpoint, saves its one-time secret, and creates a destination", async ({
  page,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
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
  await page.goto("/");

  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "AfterHook setup home" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Endpoint name")).toBeFocused();
});
