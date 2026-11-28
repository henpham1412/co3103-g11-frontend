# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
# VITE_* values are public build-time configuration. Defaults are same-origin paths served by nginx.
ARG VITE_CENTRAL_IDENTITY_API_URL=/identity/api/v1
ARG VITE_LMS_API_URL=/lms/api/v1
ARG VITE_AUTH_MODE=lms
ARG VITE_LMS_CLIENT_ID
ARG VITE_LMS_REDIRECT_URI
ENV VITE_CENTRAL_IDENTITY_API_URL=$VITE_CENTRAL_IDENTITY_API_URL \
    VITE_LMS_API_URL=$VITE_LMS_API_URL \
    VITE_AUTH_MODE=$VITE_AUTH_MODE \
    VITE_LMS_CLIENT_ID=$VITE_LMS_CLIENT_ID \
    VITE_LMS_REDIRECT_URI=$VITE_LMS_REDIRECT_URI
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
