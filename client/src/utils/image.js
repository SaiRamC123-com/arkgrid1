// Resize and re-encode before upload (small, fast, and it strips EXIF/GPS metadata)
export async function compressImage(file, max = 1280, quality = 0.8) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    return blob && blob.size < file.size ? new File([blob], "report.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}