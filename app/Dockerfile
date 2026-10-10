FROM node:24-bookworm-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY views ./views
COPY public ./public

ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["npm", "start"]
