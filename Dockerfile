FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN npm ci

COPY . .
RUN npx prisma generate

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

CMD ["npm", "run", "dev"]
