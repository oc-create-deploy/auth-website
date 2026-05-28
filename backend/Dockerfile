FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY vendor-games ./vendor-games

EXPOSE 3000

CMD ["npm", "start"]
