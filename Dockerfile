FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package*.json ./
COPY app ./app
COPY db ./db
COPY srv ./srv
COPY server.js ./server.js
RUN mkdir -p /app/db && chown -R node:node /app
USER node
EXPOSE 4004
CMD ["npm", "start"]
