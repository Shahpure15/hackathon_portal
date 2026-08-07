FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Expose Vite dev server port
EXPOSE 5173

# Start development server binding to all network interfaces for container mapping
CMD ["npm", "run", "dev", "--", "--host"]
