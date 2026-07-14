FROM node:20-alpine

WORKDIR /app
RUN npm install mongodb

COPY . .

CMD ["node", "reorder-dimensions.parallel.mjs"]
