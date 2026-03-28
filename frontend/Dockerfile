# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL=http://localhost:8000
ARG VITE_API_KEY=
ARG VITE_TENANT_ID=prod-tenant-1

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_API_KEY=${VITE_API_KEY}
ENV VITE_TENANT_ID=${VITE_TENANT_ID}

RUN npm run build

# Runtime stage
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
