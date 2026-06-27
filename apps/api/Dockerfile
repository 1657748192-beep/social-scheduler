FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
COPY apps/api/package*.json apps/api/
COPY apps/web/package*.json apps/web/
RUN npm install

FROM deps AS build
COPY apps/api apps/api
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/dist /app/apps/api/dist
COPY --from=build /app/apps/api/prisma /app/apps/api/prisma
COPY --from=build /app/apps/api/package.json /app/apps/api/package.json
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
