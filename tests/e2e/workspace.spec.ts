import { expect, test } from "@playwright/test";

test("renders the source-prioritized workspace", async ({ page }, testInfo) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Actually-Good-Notebook/);
  await expect(
    page.getByRole("heading", { name: "Source-prioritized chat" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Learn from your sources" }),
  ).toBeVisible();
  await expect(page.getByText("DeepInfra", { exact: true })).toBeVisible();

  if (testInfo.project.name === "mobile-chromium") {
    await page.getByRole("button", { name: "Sources" }).click();
    await expect(page.getByRole("button", { name: "Upload .sir" })).toBeVisible();

    await page.getByRole("button", { name: "Preview" }).click();
    await expect(
      page.getByRole("heading", { name: "No source selected" }),
    ).toBeVisible();
  } else {
    await expect(
      page.getByRole("heading", { name: "Source preview" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload .sir" })).toBeVisible();
  }
});
