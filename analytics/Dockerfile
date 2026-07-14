# Use the official Node.js 18 Alpine image for a lightweight footprint
FROM node:20-alpine
WORKDIR /app
COPY package.json /app/package.json
RUN npm install 
COPY . .
CMD ["npm", "start"]