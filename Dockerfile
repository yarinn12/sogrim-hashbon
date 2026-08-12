FROM node:22-alpine AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4173

COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json server.mjs ./
COPY src ./src
COPY assets ./assets
COPY downloads ./downloads
COPY .well-known ./.well-known
COPY index.html privacy.html support.html terms.html accessibility.html account-deletion.html ./
COPY styles.css legal.css legal.mjs manifest.webmanifest sw.js ./
COPY brand-mark.png brand-mark-v3.png icon.svg icon-192.png icon-512.png icon-maskable-512.png apple-touch-icon.png ./
COPY sogrim-logo-lockup.png sogrim-share-logo.png sogrim-home-hero.png ./

RUN chown -R node:node /app
USER node

EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4173/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
