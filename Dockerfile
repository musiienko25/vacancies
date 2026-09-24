FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
