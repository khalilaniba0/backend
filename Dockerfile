FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN mkdir -p public/cv public/logo

CMD ["node", "app.js"]
