# Stage 0, build and compile the frontend
FROM node:22-alpine AS build-stage

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./

RUN npm ci

COPY ./frontend /app/frontend
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=$VITE_BASE_PATH

RUN npm run build


# Stage 1, based on Nginx, to have only the compiled app, ready for production with Nginx
FROM nginx:1-alpine

COPY --from=build-stage /app/frontend/dist/ /usr/share/nginx/html

COPY ./frontend/nginx.conf /etc/nginx/conf.d/default.conf
