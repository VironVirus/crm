const MAX_IMAGE_DIMENSION = 1600;
const QUALITY_STEPS = [0.82, 0.74, 0.66, 0.58, 0.5];
const MIN_SCALE = 0.5;

function replaceExtension(filename: string, extension: string) {
  const cleanName = filename.trim() || "upload";

  return `${cleanName.replace(/\.[^.]+$/, "")}.${extension}`;
}

async function loadImage(file: File) {
  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();

      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Unable to read this image."));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Unable to prepare this image."));
          return;
        }

        resolve(blob);
      },
      "image/webp",
      quality,
    );
  });
}

export async function compressImageToWebp(file: File, maxBytes: number) {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  const image = await loadImage(file);
  const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const baseScale = largestSide > MAX_IMAGE_DIMENSION
    ? MAX_IMAGE_DIMENSION / largestSide
    : 1;

  let scale = baseScale;

  while (scale >= MIN_SCALE) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Unable to prepare this image.");
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, quality);

      if (blob.size <= maxBytes) {
        return new File([blob], replaceExtension(file.name, "webp"), {
          lastModified: Date.now(),
          type: "image/webp",
        });
      }
    }

    scale *= 0.8;
  }

  throw new Error("This image is still larger than 1MB after compression.");
}
