import JSZip from "jszip";

export async function readSirImageObjectUrls(
  input: ArrayBuffer | Uint8Array,
  imagePaths: string[],
): Promise<Record<number, string>> {
  const zip = await JSZip.loadAsync(input);
  const objectUrls: string[] = [];

  try {
    const entries = await Promise.all(
      imagePaths.map(async (imagePath, index) => {
        const file = zip.file(imagePath);

        if (!file) {
          throw new Error(`Could not find slide image "${imagePath}".`);
        }

        const blob = await file.async("blob");
        const objectUrl = URL.createObjectURL(
          new Blob([blob], { type: "image/webp" }),
        );
        objectUrls.push(objectUrl);

        return [index + 1, objectUrl] as const;
      }),
    );

    return Object.fromEntries(entries);
  } catch (error) {
    for (const objectUrl of objectUrls) {
      URL.revokeObjectURL(objectUrl);
    }

    throw error;
  }
}
