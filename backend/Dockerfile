FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
COPY vendor-games ./vendor-games

EXPOSE 3000

CMD ["npm", "start"]
