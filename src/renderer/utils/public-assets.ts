// Production HTML sits in dist/, while the media library is kept once in
// public/. Vite serves that same directory at the URL root during development.
export function publicAssetUrl(url:string, production=import.meta.env.PROD, base=import.meta.env.BASE_URL):string {
  return url.startsWith('/')?(production?'../public/':base)+url.slice(1):url;
}
