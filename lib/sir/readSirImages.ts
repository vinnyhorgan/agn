import JSZip from "jszip";

const zipCache = new WeakMap<ArrayBuffer, Promise<JSZip>>();

export async function readSirImageObjectUrl(
  input: ArrayBuffer,
  imagePath: string,
): Promise<string> {
  let zipPromise = zipCache.get(input);

  if (!zipPromise) {
    zipPromise = JSZip.loadAsync(input);
    zipCache.set(input, zipPromise);
  }

  const zip = await zipPromise;
  const file = zip.file(imagePath);

  if (!file) {
    throw new Error(`Could not find slide image "${imagePath}".`);
  }

  const blob = await file.async("blob");
  return URL.createObjectURL(new Blob([blob], { type: "image/webp" }));
}
