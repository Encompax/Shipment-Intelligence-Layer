FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p db

EXPOSE 3001

CMD ["node", "index.js"]
