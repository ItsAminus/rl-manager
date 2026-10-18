const image = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(Error('This image could not be decoded. Choose a valid PNG, JPG or WebP file and try again.'));
    i.src = url;
  });
export async function imageFilePng(file: File, width: number, height: number) {
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw Error('Choose a PNG, JPG or WebP image up to 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const i = await image(url),
      canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const ratio = Math.min(width / i.width, height / i.height);
    ctx.drawImage(
      i,
      (width - i.width * ratio) / 2,
      (height - i.height * ratio) / 2,
      i.width * ratio,
      i.height * ratio
    );
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function svgPng(svg: SVGSVGElement | null, width: number, height: number) {
  if (!svg) throw Error('Preview not ready.');
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  for (const element of clone.querySelectorAll('image')) {
    const source = element.getAttribute('href');
    if (source && !source.startsWith('data:')) {
      const i = await image(new URL(source, location.href).href),
        c = document.createElement('canvas');
      c.width = i.naturalWidth;
      c.height = i.naturalHeight;
      c.getContext('2d')!.drawImage(i, 0, 0);
      element.setAttribute('href', c.toDataURL('image/png'));
    }
  }
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' })
  );
  try {
    const i = await image(url),
      c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    c.getContext('2d')!.drawImage(i, 0, 0, width, height);
    return c.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function downloadDesign(data: string, name: string) {
  const a = document.createElement('a');
  a.href = data;
  a.download = name;
  a.click();
}
