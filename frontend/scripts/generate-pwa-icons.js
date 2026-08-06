const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const publicDir = path.join(__dirname, '..', 'public');
const iconsDir = path.join(publicDir, 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Custom icon badge featuring the SDA flame emblem and "SDA Loma Linda Meru"
function createIconSvg(width, height, safePadding = 0) {
  const innerW = width - safePadding * 2;
  const innerH = height - safePadding * 2;
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#26352f" />
      <g transform="translate(${safePadding}, ${safePadding})">
        <!-- Clean White Flame & Cross SDA Symbol -->
        <g transform="translate(${innerW * 0.24}, ${innerH * 0.12}) scale(${innerW * 0.0021})">
          <path fill="#FFFFFF" d="M92.989 144.298c0 .54.62.543.732 0 .824-3.998 2.076-6.662 4.033-9.25l-4.401.003a.365.365 0 0 0-.364.364v8.883zm32.32-55.485c-.181-.585-.687-.623-.682-.011.05 5.779-1.612 10.745-12.16 21.294l-8.344 8.336c-3.797 3.797-7.211 7.265-9.23 10.73h8.24l.975-.975 11.97-11.982c9.969-9.97 11.359-20.514 9.23-27.392zm-11.187 35.249l-10 10.007c-6.051 6.053-11.133 11.268-11.133 16.97l.006 1.589c0 .43.536.499.7.048 1.87-5.106 8.113-10.556 19.565-8.624 0 0 49.89 8.62 50.31 8.658.487.043.728-.437.414-.811-.19-.224-23.22-23.254-23.22-23.254l-26.642-4.583zm-36.093 10.987a.364.364 0 0 1-.364-.364v-5.162c0-.201.163-.364.364-.364l8.732.002a.364.364 0 0 0 .364-.363c-.023-4.638-3.518-7.79-17.523-5.351l-30.24 5.198s-23.032 23.03-23.221 23.254c-.314.374-.073.854.414.81.42-.036 50.31-8.657 50.31-8.657 11.453-1.932 17.696 3.518 19.564 8.624.165.45.702.383.702-.048v-17.215a.364.364 0 0 0-.363-.364h-8.74zm-13.94-72.152c-9.968 9.969-11.358 20.514-9.23 27.392.18.585.687.623.682.01-.05-5.778 1.613-10.745 12.16-21.293l22.74-22.733c6.053-6.053 11.135-11.268 11.135-16.971v-8.895c0-.541-.62-.543-.732 0-1.496 7.259-4.4 10.123-10.387 16.11L64.09 62.898zm37.509-17.973v-8.956c0-.541-.62-.543-.732 0-1.496 7.26-4.392 10.169-10.38 16.157L66.603 75.988c-11.59 11.59-13.596 22.808-7.701 30.016.393.48.816.192.56-.388-3.898-8.818 5.448-18.167 9.898-22.617l21.104-21.105c6.052-6.052 11.134-11.267 11.134-16.97zm-34.34 46.044c-11.591 11.592-6.261 22.787.5 25.868.593.27.829-.211.375-.604-5.421-4.696-3.775-12.597 3.043-19.414L90.44 77.553c6.052-6.052 11.133-11.267 11.133-16.97v-8.895c0-.541-.62-.543-.731 0-1.496 7.259-4.394 10.11-10.381 16.099l-23.203 23.18zm25.71 28.813v8.955c0 .54.62.543.73 0 1.498-7.26 4.394-10.168 10.38-16.156l9.488-9.466c11.59-11.59 13.595-22.808 7.7-30.016-.393-.48-.816-.193-.56.387 3.898 8.818-5.447 18.168-9.897 22.618l-6.707 6.707c-6.053 6.053-11.134 11.268-11.134 16.97zm11.137-22.863c-5.988 5.988-8.886 8.84-10.381 16.099-.112.543-.732.54-.732 0v-8.895c0-5.703 5.08-10.918 11.134-16.97l4.867-4.868c6.818-6.818 8.464-14.718 3.042-19.415-.453-.392-.217-.874.376-.603 6.76 3.08 12.09 14.276.499 25.867l-8.805 8.785z"/>
        </g>
        <!-- Clean Typography "SDA Loma Linda Meru" -->
        <text x="${innerW / 2}" y="${innerH * 0.72}" font-family="sans-serif" font-weight="800" font-size="${innerW * 0.085}" fill="#b36b3c" text-anchor="middle" letter-spacing="1">SDA</text>
        <text x="${innerW / 2}" y="${innerH * 0.83}" font-family="sans-serif" font-weight="700" font-size="${innerW * 0.08}" fill="#FFFFFF" text-anchor="middle" letter-spacing="0.5">LOMA LINDA</text>
        <text x="${innerW / 2}" y="${innerH * 0.92}" font-family="sans-serif" font-weight="600" font-size="${innerW * 0.065}" fill="#b36b3c" text-anchor="middle" letter-spacing="1">MERU</text>
      </g>
    </svg>
  `;
}

async function generate() {
  await sharp(Buffer.from(createIconSvg(192, 192, 0)))
    .png()
    .toFile(path.join(iconsDir, 'icon-192x192.png'));

  await sharp(Buffer.from(createIconSvg(512, 512, 0)))
    .png()
    .toFile(path.join(iconsDir, 'icon-512x512.png'));

  await sharp(Buffer.from(createIconSvg(512, 512, 64)))
    .png()
    .toFile(path.join(iconsDir, 'icon-512x512-maskable.png'));

  await sharp(Buffer.from(createIconSvg(180, 180, 0)))
    .png()
    .toFile(path.join(iconsDir, 'apple-touch-icon.png'));

  console.log('SDA Loma Linda Meru PWA Icons generated successfully!');
}

generate().catch(console.error);
