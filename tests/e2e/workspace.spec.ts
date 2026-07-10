import { expect, test } from "@playwright/test";
import JSZip from "jszip";

test("renders the responsive notebook workspace", async ({ page }, testInfo) => {
  await page.goto("/");

  await expect(page).toHaveTitle("agn by dvh");
  await expect(page.getByRole("heading", { name: "Chat" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ask about your library" }),
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

test("toggles and persists the color theme", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");

  await page.goto("/");
  await page.evaluate(() => window.localStorage.setItem("agn.theme", "light"));
  await page.reload();
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("persists unique decks and remembers each deck's slide", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");

  const firstDeck = await createSirArchive("Database Foundations", 3);
  const secondDeck = await createSirArchive("SQL Practice", 2);

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Upload .sir" })).toBeEnabled();
  const fileInput = page.locator('input[type="file"]');

  await fileInput.setInputFiles({
    name: "database.sir",
    mimeType: "application/zip",
    buffer: firstDeck,
  });
  await expect(page.getByText("Database Foundations", { exact: true }).first()).toBeVisible();

  await fileInput.setInputFiles({
    name: "database-copy.sir",
    mimeType: "application/zip",
    buffer: firstDeck,
  });
  await expect(
    page.getByText("This exact SIR file is already in your library."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Slide 2 / 3")).toBeVisible();

  await fileInput.setInputFiles({
    name: "practice.sir",
    mimeType: "application/zip",
    buffer: secondDeck,
  });
  await page.locator("button").filter({ hasText: "Source 2" }).click();
  await expect(page.getByText("Slide 1 / 2")).toBeVisible();

  await page.locator("button").filter({ hasText: "Source 1" }).click();
  await expect(page.getByText("Slide 2 / 3")).toBeVisible();

  await page.getByRole("button", { name: "Enlarge slide 2" }).click();
  await expect(page.getByRole("dialog", { name: "Slide 2 image" })).toBeVisible();
  await page.getByRole("button", { name: "Next slide" }).click();
  await expect(page.getByRole("dialog", { name: "Slide 3 image" })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("dialog", { name: "Slide 2 image" })).toBeVisible();
  await page.getByRole("button", { name: "Close enlarged slide" }).click();

  await page.reload();
  await expect(page.getByText("Database Foundations", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("SQL Practice", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Slide 2 / 3")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove Database Foundations" }).click();
  await expect(page.getByText("Database Foundations", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Database Foundations", { exact: true })).toHaveCount(0);
  await expect(page.getByText("SQL Practice", { exact: true }).first()).toBeVisible();
});

test("shows a pending turn immediately and restores completed chat", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");

  await page.addInitScript(() => {
    window.localStorage.setItem("agn.deepInfra.apiKey", "test-key");
  });
  await page.route("**/api/deepinfra/chat", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({
      status: 200,
      contentType: "text/plain; charset=utf-8",
      body: "A streamed answer.",
    });
  });

  await page.goto("/");
  await page.getByLabel("Ask a question").fill("What is SQL?");
  await page.getByRole("button", { name: "Send question" }).click();

  await expect(page.getByText("What is SQL?")).toBeVisible();
  await expect(page.getByText("Thinking")).toBeVisible();
  await expect(page.getByText("A streamed answer.")).toBeVisible();

  await page.reload();
  await expect(page.getByText("What is SQL?")).toBeVisible();
  await expect(page.getByText("A streamed answer.")).toBeVisible();
});

test("imports a mixed SIR v2 corpus and preserves source-local slides", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");

  const corpus = await createMixedSirArchive();
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "database-corpus.sir",
    mimeType: "application/zip",
    buffer: corpus,
  });

  await expect(page.getByText("Sources 1–3", { exact: true })).toBeVisible();
  await expect(page.getByText("3 sources", { exact: true })).toBeVisible();
  await expect(page.getByText("Slide 1 / 2", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Source 2: exam" }).click();
  await expect(page.getByRole("heading", { name: "exam" })).toBeVisible();
  await expect(page.getByText("Slide 1 / 1", { exact: true })).toBeVisible();

  await page.getByPlaceholder("Search slides").fill("Domanda SQL");
  await page.getByRole("button", { name: /exam[\s\S]*Slide 1/ }).click();
  await expect(page.getByRole("heading", { name: "exam" })).toBeVisible();
  await expect(page.getByText("Slide 1 / 1", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Sources 1–3", { exact: true })).toBeVisible();
  await expect(page.getByText("Slide 1 / 1", { exact: true })).toBeVisible();
});

async function createSirArchive(
  title: string,
  slideCount: number,
): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "manifest.json",
    JSON.stringify({ sir: 1, title, language: "en", slide_count: slideCount }),
  );
  zip.file(
    "sir.md",
    Array.from(
      { length: slideCount },
      (_, index) =>
        `<!-- slide: ${index + 1} -->\n# ${title} ${index + 1}\n\nSlide ${index + 1} substantive content.\n\n---\n`,
    ).join(""),
  );
  zip.folder("slides");

  for (let index = 1; index <= slideCount; index += 1) {
    zip.file(
      `slides/${String(index).padStart(4, "0")}.webp`,
      new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45,
        0x42, 0x50,
      ]),
    );
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

async function createMixedSirArchive(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "manifest.json",
    JSON.stringify({
      sir: 2,
      title: "Database Corpus",
      language: "it",
      source_count: 3,
      slide_count: 4,
    }),
  );
  zip.file(
    "sources.json",
    JSON.stringify([
      {
        source: 1,
        title: "slides",
        path: "lectures/slides.pdf",
        type: "pdf",
        language: "it",
        slide_start: 1,
        slide_count: 2,
      },
      {
        source: 2,
        title: "exam",
        path: "exams/exam.jpeg",
        type: "image",
        language: "it",
        slide_start: 3,
        slide_count: 1,
      },
      {
        source: 3,
        title: "outline",
        path: "outline.md",
        type: "markdown",
        language: "it",
        slide_start: 4,
        slide_count: 1,
      },
    ]),
  );
  zip.file(
    "sir.md",
    [
      "<!-- slide: 1 -->\n# Introduzione\nIntroduzione completa al modello relazionale.",
      "<!-- slide: 2 -->\n# Chiavi\nDefinizione ed esempio completo di chiave candidata.",
      "<!-- slide: 3 -->\n# Esame\nTrascrizione completa della domanda SQL fotografata.",
      "<!-- slide: 4 -->\n# Programma\nOrganizzazione dettagliata degli argomenti del corso.",
    ].join("\n\n"),
  );
  zip.folder("slides");
  for (let index = 1; index <= 4; index += 1) {
    zip.file(
      `slides/${String(index).padStart(4, "0")}.webp`,
      new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45,
        0x42, 0x50,
      ]),
    );
  }
  return zip.generateAsync({ type: "nodebuffer" });
}
