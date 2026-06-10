# Build stage: generate site/data.js and the site/content/ bundle from
# the curriculum sources, exactly like the CI/Vercel build did.
FROM node:20-alpine AS build
WORKDIR /repo
COPY . .
RUN node site/build.js

# Serve stage: Caddy serves the fully built static site. The Caddyfile
# replicates the old vercel.json behavior (clean URLs, cache headers)
# and is where the license gate will live.
FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/site /srv
