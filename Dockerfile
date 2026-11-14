# ---- Build the React client
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- Production image: Express API + built client
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN npm ci --omit=dev --prefix server && npm cache clean --force
COPY server/ ./server/
COPY database/ ./database/
COPY --from=client /app/client/dist ./client/dist
EXPOSE 8080
CMD ["node", "server/app.js"]
