export interface AvatarResizeOptions {
  size: number;
  quality: number;
}

const DEFAULT_OPTIONS: AvatarResizeOptions = {
  size: 512,
  quality: 0.6,
};

export async function resizeAvatarToWebp(file: File, options: AvatarResizeOptions = DEFAULT_OPTIONS): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Avatar file must be an image.");
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = options.size;
    canvas.height = options.size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas rendering is not available.");

    const scale = Math.max(options.size / bitmap.width, options.size / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    const x = (options.size - width) / 2;
    const y = (options.size - height) / 2;

    context.clearRect(0, 0, options.size, options.size);
    context.drawImage(bitmap, x, y, width, height);
    return canvas.toDataURL("image/webp", options.quality);
  } finally {
    bitmap.close();
  }
}
