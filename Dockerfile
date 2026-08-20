FROM node:18-bookworm-slim

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p public/cv public/logo public/profile-photos logs

EXPOSE 5000

CMD ["sh", "-c", "node scripts/wait-for-mongo.js && node app.js"]