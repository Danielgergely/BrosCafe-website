# Bros Cafe website — build the React bundle, then serve it from nginx.

# ---- build ----------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 600000

COPY . .

# REACT_APP_BACKEND_URL is deliberately left empty: the app then calls a
# relative /api, which nginx proxies to the backend on the same origin.
ENV REACT_APP_BACKEND_URL="" \
    GENERATE_SOURCEMAP=false \
    CI=true
RUN yarn build

# ---- serve ----------------------------------------------------------------
FROM nginx:1.27-alpine

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1
