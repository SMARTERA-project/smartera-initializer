# Use the official Node.js 18 Alpine image for a lightweight footprint
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Install PM2 globally to manage the application process
RUN npm install -g pm2

# Copy package.json and package-lock.json (if available) first to leverage Docker cache
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy the rest of the application source code into the container
COPY . .

# Start the application using pm2-runtime (specifically designed for Docker containers)
CMD ["pm2-runtime", "start", "ecosystem.config.js"]