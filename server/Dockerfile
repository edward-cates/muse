FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/

RUN npm ci --workspace=server

COPY server/src server/src
COPY server/tsconfig.json server/

RUN npm run build -w server

EXPOSE 4444

CMD ["node", "server/dist/index.js"]
