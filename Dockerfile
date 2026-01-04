FROM node:20-alpine

WORKDIR /app

# Install dependencies first
COPY app/package.json ./package.json
RUN npm install

# Copy the actual app code
COPY app/src ./src
COPY app/public ./public

EXPOSE 3000
CMD ["npm", "start"]
