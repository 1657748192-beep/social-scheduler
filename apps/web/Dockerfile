FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
COPY apps/api/package*.json apps/api/
COPY apps/web/package*.json apps/web/
RUN npm install

FROM deps AS build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY apps/web apps/web
WORKDIR /app/apps/web
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=build /app/apps/web/.next /app/apps/web/.next
COPY --from=build /app/apps/web/app /app/apps/web/app
COPY --from=build /app/apps/web/components /app/apps/web/components
COPY --from=build /app/apps/web/lib /app/apps/web/lib
COPY --from=build /app/apps/web/public /app/apps/web/public
COPY --from=build /app/apps/web/package.json /app/apps/web/package.json
COPY --from=build /app/apps/web/next.config.mjs /app/apps/web/next.config.mjs
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npm", "run", "start"]
