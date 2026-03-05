FROM node:20-slim

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .

RUN mkdir -p data/batches data/outputs data/assets

EXPOSE 5000
CMD ["node", "index.js"]
